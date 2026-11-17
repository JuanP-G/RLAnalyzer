// Actualizador de RLAnalyzer: la app se ejecuta desde un clon de git (no hay instalador),
// así que actualizar = traer la rama main del repo público, avanzar en fast-forward e
// instalar solo las dependencias que hayan cambiado.
//
// Módulo puro de Node (sin imports de Electron) para poder probarlo con `node --test`.
// Quien lo usa (main.js) se encarga de parar/relanzar los servicios y de la interfaz.

const { spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

// Repo público por defecto. Se trae SIEMPRE de esta URL (no de `origin`): así no depende de
// credenciales guardadas en el remote (un token caducado/revocado daría 401 aunque el repo
// sea público). Se puede cambiar con RL_UPDATE_URL (también lo usan los tests).
const DEFAULT_REPO_URL = 'https://github.com/JuanP-G/RLAnalyzer.git'
const UPDATE_REF       = 'refs/rlanalyzer/update'
const ELECTRON_MARKER  = '.needs-npm-install'   // start-app.bat instala y lo borra
const MAX_DB_BACKUPS   = 3

// Quita URLs (y cualquier credencial incrustada) de los mensajes que llegan a la interfaz.
function sanitize(text) {
  return String(text || '')
    .replace(/https?:\/\/[^\s'"]+/g, '<url>')
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '<token>')
    .trim()
}

function run(cmd, args, { cwd, shell = false, env, timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    let out = '', err = ''
    let child, timer
    try {
      child = spawn(cmd, args, {
        cwd, shell, windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
      })
    } catch (e) {
      return resolve({ code: -1, out: '', err: e.message })
    }
    if (timeoutMs) {
      timer = setTimeout(() => {
        err += `\nTiempo de espera agotado (${Math.round(timeoutMs / 1000)} s)`
        try { child.kill() } catch { /* ya terminó */ }
      }, timeoutMs)
    }
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: err + e.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code: code ?? -1, out: out.trim(), err: err.trim() }) })
  })
}

const FETCH_TIMEOUT_MS = 60_000   // sin red, no dejar la pantalla de "Actualizando…" colgada

class UpdateError extends Error {}

function createUpdater({
  root,
  repoUrl   = process.env.RL_UPDATE_URL || DEFAULT_REPO_URL,
  branch    = 'main',
  python,                       // ruta al python del .venv
  installers,                   // solo tests: sustituye a las instalaciones reales
  log       = () => {},
} = {}) {
  const git = async (...args) => {
    // credential.helper vacío: nunca abrir el diálogo del Credential Manager de Windows.
    const timeoutMs = args[0] === 'fetch' ? FETCH_TIMEOUT_MS : 0
    const r = await run('git', ['-c', 'credential.helper=', ...args], { cwd: root, timeoutMs })
    if (r.code !== 0) throw new UpdateError(sanitize(r.err || r.out || `git ${args[0]} falló`))
    return r.out
  }

  const realInstallers = {
    backend:  () => run(python, ['-m', 'pip', 'install', '-r', path.join('backend', 'requirements.txt'),
                                 '--disable-pip-version-check', '-q'], { cwd: root }),
    // npm es npm.cmd en Windows: sin shell, Node 24 lanza EINVAL.
    frontend: () => run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(root, 'frontend'), shell: true }),
  }
  const install = installers || realInstallers

  function version() {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, 'electron', 'package.json'), 'utf8')).version
    } catch { return null }
  }

  // Estado local, sin red.
  async function localState() {
    if (!fs.existsSync(path.join(root, '.git'))) {
      return { supported: false, reason: 'not-git', version: version() }
    }
    const [head, current, dirty] = await Promise.all([
      git('rev-parse', 'HEAD'),
      git('rev-parse', '--abbrev-ref', 'HEAD'),
      git('status', '--porcelain', '--untracked-files=no'),
    ])
    // Archivos modificados (para poder explicar en la interfaz por qué no se actualiza)
    const dirtyFiles = dirty ? dirty.split('\n').map(l => l.replace(/^\s*\S+\s+/, '')).filter(Boolean) : []
    return { supported: true, version: version(), head, branch: current, dirty: dirtyFiles.length > 0, dirtyFiles }
  }

  // Trae main del repo público a una ref propia y compara con HEAD.
  async function check() {
    try {
      const local = await localState()
      if (!local.supported) return { state: 'unsupported', ...local }
      await git('fetch', '--no-tags', '--quiet', repoUrl, `+refs/heads/${branch}:${UPDATE_REF}`)
      const remote = await git('rev-parse', UPDATE_REF)
      const behind = Number(await git('rev-list', '--count', `HEAD..${UPDATE_REF}`))
      const ahead  = Number(await git('rev-list', '--count', `${UPDATE_REF}..HEAD`))
      const commits = behind === 0 ? [] : (await git('log', '--no-merges', '--format=%h%x09%cs%x09%s',
                                                     `HEAD..${UPDATE_REF}`))
        .split('\n').filter(Boolean).map(l => {
          const [sha, date, ...rest] = l.split('\t')
          return { sha, date, subject: rest.join('\t') }
        })
      const base = { ...local, remote: remote.slice(0, 7), behind, ahead, commits }

      if (behind === 0) return { state: 'up-to-date', ...base }
      // Hay novedades, pero solo se aplican sobre una instalación "de usuario" limpia.
      let blocked = null
      if (local.branch !== branch) blocked = 'branch'     // checkout de desarrollo
      else if (local.dirty)        blocked = 'dirty'      // cambios locales sin commitear
      else if (ahead > 0)          blocked = 'diverged'   // commits locales que no están en main
      return { state: blocked ? 'blocked' : 'available', blocked, ...base }
    } catch (e) {
      return { state: 'error', error: sanitize(e.message) }
    }
  }

  function backupDatabase(tag) {
    const db = path.join(root, 'data', 'rl_data.db')
    if (!fs.existsSync(db)) return null
    const dir = path.join(root, 'data', 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dest = path.join(dir, `rl_data-antes-de-actualizar-${stamp}-${tag}.db`)
    fs.copyFileSync(db, dest)
    // Conservar solo las últimas copias
    const old = fs.readdirSync(dir).filter(f => f.startsWith('rl_data-antes-de-actualizar-')).sort()
    for (const f of old.slice(0, Math.max(0, old.length - MAX_DB_BACKUPS))) {
      try { fs.unlinkSync(path.join(dir, f)) } catch { /* en uso: se borrará la próxima vez */ }
    }
    return dest
  }

  async function runInstall(which) {
    const r = await install[which]()
    if (r.code !== 0) {
      const tail = (r.err || r.out || '').split('\n').slice(-6).join('\n')
      throw new UpdateError(`Falló la instalación de dependencias (${which}): ${sanitize(tail)}`)
    }
  }

  // Aplica la actualización. `stopServices` debe parar backend y frontend ANTES de tocar
  // archivos (en Windows bloquean .pyd y node_modules). Devuelve { ok, ... } sin lanzar.
  async function apply({ stopServices = async () => {}, onProgress = () => {} } = {}) {
    const info = await check()
    if (info.state !== 'available') {
      return { ok: false, error: info.error || `No se puede actualizar (${info.blocked || info.state})`, info }
    }
    const oldHead = info.head
    const changed = (await git('diff', '--name-only', 'HEAD', UPDATE_REF)).split('\n').filter(Boolean)
    const needs = {
      backend:  changed.includes('backend/requirements.txt'),
      frontend: changed.some(f => f === 'frontend/package.json' || f === 'frontend/package-lock.json'),
      electron: changed.some(f => f === 'electron/package.json' || f === 'electron/package-lock.json'),
    }
    const attempted = []
    let backup = null
    try {
      onProgress('Cerrando servicios…')
      await stopServices()
      onProgress('Haciendo copia de la base de datos…')
      backup = backupDatabase(oldHead.slice(0, 7))
      onProgress(`Descargando ${info.behind} cambio(s)…`)
      await git('merge', '--ff-only', '--quiet', UPDATE_REF)
      if (needs.backend)  { attempted.push('backend');  onProgress('Actualizando dependencias de Python…'); await runInstall('backend') }
      if (needs.frontend) { attempted.push('frontend'); onProgress('Actualizando dependencias de la interfaz…'); await runInstall('frontend') }
      // Electron está en uso (su propio node_modules): se instala en el próximo arranque.
      if (needs.electron) fs.writeFileSync(path.join(root, 'electron', ELECTRON_MARKER), new Date().toISOString())
      log(`[update] ${oldHead.slice(0, 7)} → ${info.remote} (${changed.length} archivos)`)
      return { ok: true, from: oldHead.slice(0, 7), to: info.remote, needs, backup }
    } catch (e) {
      // Vuelta atrás: el árbol estaba limpio (comprobado en check), así que reset --hard es seguro.
      log(`[update] error, revirtiendo a ${oldHead.slice(0, 7)}: ${e.message}`)
      let rolledBack = false
      try {
        await git('reset', '--hard', '--quiet', oldHead)
        try { fs.unlinkSync(path.join(root, 'electron', ELECTRON_MARKER)) } catch { /* no existía */ }
        for (const w of attempted) await install[w]()   // reinstalar lo de la versión anterior
        rolledBack = true
      } catch (e2) {
        log(`[update] la vuelta atrás también falló: ${e2.message}`)
      }
      return { ok: false, error: sanitize(e.message), rolledBack, backup }
    }
  }

  return { check, apply, localState }
}

module.exports = { createUpdater, sanitize, DEFAULT_REPO_URL, ELECTRON_MARKER }
