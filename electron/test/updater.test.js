// Pruebas del actualizador contra repos de git locales (sin red ni GitHub).
// Ejecutar:  cd electron && npm test
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { createUpdater, sanitize, ELECTRON_MARKER } = require('../updater')

const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
                                        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const read  = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r/g, '')   // core.autocrlf
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}

let tmp, bare, dev, app, calls
const ok   = which => async () => { calls.push(which); return { code: 0, out: '', err: '' } }
const fail = which => async () => { calls.push(which); return { code: 1, out: '', err: 'boom' } }

// Publica un commit en el "repo público" (bare) desde el clon de desarrollo.
function publish(files, msg) {
  for (const [rel, text] of Object.entries(files)) write(dev, rel, text)
  g(dev, 'add', '-A'); g(dev, 'commit', '-qm', msg); g(dev, 'push', '-q', 'origin', 'main')
}

function updater(installers = { backend: ok('backend'), frontend: ok('frontend') }) {
  return createUpdater({ root: app, repoUrl: bare, installers })
}

beforeEach(() => {
  tmp  = fs.mkdtempSync(path.join(os.tmpdir(), 'rlupd-'))
  bare = path.join(tmp, 'remote.git')
  dev  = path.join(tmp, 'dev')
  app  = path.join(tmp, 'app')
  calls = []
  g(tmp, 'init', '-q', '--bare', '-b', 'main', bare)
  g(tmp, 'clone', '-q', bare, dev)
  g(dev, 'checkout', '-q', '-b', 'main')
  publish({
    '.gitignore': 'data/\n',
    'electron/package.json': '{"version":"0.6.0"}',
    'backend/requirements.txt': 'fastapi==1\n',
    'frontend/package.json': '{}',
    'README.md': 'v1\n',
  }, 'v1')
  g(tmp, 'clone', '-q', bare, app)
  write(app, 'data/rl_data.db', 'DB')   // sin seguimiento (gitignored), como en la app real
})

afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* Windows: archivo en uso */ } })

test('al día: no hay nada que aplicar', async () => {
  const r = await updater().check()
  assert.equal(r.state, 'up-to-date')
  assert.equal(r.version, '0.6.0')
})

test('por detrás: avanza, instala solo lo que cambió y hace copia de la BD', async () => {
  publish({ 'README.md': 'v2\n' }, 'docs: v2')
  publish({ 'backend/requirements.txt': 'fastapi==2\n' }, 'deps: fastapi 2')
  const u = updater()
  const c = await u.check()
  assert.equal(c.state, 'available')
  assert.equal(c.behind, 2)
  assert.deepEqual(c.commits.map(x => x.subject), ['deps: fastapi 2', 'docs: v2'])

  let stopped = false
  const r = await u.apply({ stopServices: async () => { stopped = true } })
  assert.equal(r.ok, true, r.error)
  assert.ok(stopped)
  assert.deepEqual(calls, ['backend'])
  assert.deepEqual(r.needs, { backend: true, frontend: false, electron: false })
  assert.equal(read(app, 'backend/requirements.txt'), 'fastapi==2\n')
  assert.ok(fs.existsSync(r.backup))
  assert.equal(g(app, 'rev-parse', 'HEAD'), g(dev, 'rev-parse', 'HEAD'))
  assert.equal((await u.check()).state, 'up-to-date')
})

test('cambio en Electron: deja la marca para instalar en el próximo arranque', async () => {
  publish({ 'electron/package.json': '{"version":"0.7.0"}' }, 'electron 0.7')
  const r = await updater().apply()
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(calls, [])
  assert.ok(fs.existsSync(path.join(app, 'electron', ELECTRON_MARKER)))
})

test('cambios locales sin commitear: bloquea', async () => {
  publish({ 'README.md': 'v2\n' }, 'v2')
  write(app, 'README.md', 'tocado a mano\n')
  const u = updater()
  const c = await u.check()
  assert.equal(c.state, 'blocked'); assert.equal(c.blocked, 'dirty')
  assert.deepEqual(c.dirtyFiles, ['README.md'])
  const r = await u.apply()
  assert.equal(r.ok, false)
  assert.equal(read(app, 'README.md'), 'tocado a mano\n')
})

test('otra rama (checkout de desarrollo): bloquea', async () => {
  publish({ 'README.md': 'v2\n' }, 'v2')
  g(app, 'checkout', '-q', '-b', 'feat/x')
  const c = await updater().check()
  assert.equal(c.state, 'blocked'); assert.equal(c.blocked, 'branch')
})

test('commits locales que no están en main: bloquea (sin fast-forward)', async () => {
  publish({ 'README.md': 'v2\n' }, 'v2')
  write(app, 'local.txt', 'x'); g(app, 'add', '-A'); g(app, 'commit', '-qm', 'local')
  const c = await updater().check()
  assert.equal(c.state, 'blocked'); assert.equal(c.blocked, 'diverged')
})

test('si falla una instalación, vuelve a la versión anterior', async () => {
  const before = g(app, 'rev-parse', 'HEAD')
  publish({ 'frontend/package.json': '{"x":1}', 'electron/package.json': '{"version":"0.7.0"}' }, 'roto')
  const r = await updater({ backend: ok('backend'), frontend: fail('frontend') }).apply()
  assert.equal(r.ok, false)
  assert.equal(r.rolledBack, true)
  assert.match(r.error, /frontend/)
  assert.equal(g(app, 'rev-parse', 'HEAD'), before)
  assert.equal(read(app, 'frontend/package.json'), '{}')
  assert.ok(!fs.existsSync(path.join(app, 'electron', ELECTRON_MARKER)))
  assert.deepEqual(calls, ['frontend', 'frontend'])   // intento + reinstalación de la versión anterior
})

test('sin .git: no soportado', async () => {
  const plain = path.join(tmp, 'zip'); fs.mkdirSync(plain)
  const r = await createUpdater({ root: plain, repoUrl: bare }).check()
  assert.equal(r.state, 'unsupported'); assert.equal(r.reason, 'not-git')
})

test('URL inalcanzable: error sin filtrar URLs ni tokens', async () => {
  const r = await createUpdater({ root: app, repoUrl: path.join(tmp, 'no-existe.git') }).check()
  assert.equal(r.state, 'error')
  assert.equal(sanitize('fatal: https://u:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/x 401'), 'fatal: <url> 401')
})
