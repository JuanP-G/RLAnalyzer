const { app, BrowserWindow, WebContentsView, shell, Menu, ipcMain, dialog, Notification } = require('electron')
const fs = require('fs')
const { spawn, execFileSync }        = require('child_process')
const path                           = require('path')
const http                           = require('http')
const { createUpdater }              = require('./updater')

const ROOT = path.join(__dirname, '..')

// Identidad de la app (debe coincidir entre setAppUserModelId, el registro y el shortcut).
const AUMID = 'com.rlanalyzer.app'

// Registra el AppUserModelId en el registro de Windows para que el sistema acepte los toasts
// y RLAnalyzer aparezca en Configuración ▸ Notificaciones. Sin esto, Notification.show() falla
// con HRESULT 0x803E0114 (app no registrada). Idempotente: se ejecuta en cada arranque.
function registerAumidForToasts() {
  if (process.platform !== 'win32') return
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${AUMID}`
  const iconPath = path.join(__dirname, 'icon.ico')   // mismo icono que el toast
  try {
    execFileSync('reg', ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'RLAnalyzer', '/f'], { windowsHide: true })
    execFileSync('reg', ['add', key, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconPath, '/f'], { windowsHide: true })
    console.log('[notify] AppUserModelId registrado:', AUMID)
  } catch (err) {
    console.error('[notify] no se pudo registrar el AppUserModelId:', err.message)
  }
}

// Puertos centralizados (un único sitio; overridables por entorno).
// Deben coincidir con backend/config.py (BACKEND_PORT) y frontend/vite.config.js.
const BACKEND_PORT  = Number(process.env.RL_BACKEND_PORT)  || 8000
const FRONTEND_PORT = Number(process.env.RL_FRONTEND_PORT) || 5173
const BACKEND_URL   = `http://localhost:${BACKEND_PORT}`
const FRONTEND_URL  = `http://localhost:${FRONTEND_PORT}`

let mainWindow
let backendProc
let frontendProc
let bcView = null        // WebContentsView que embebe la web de Ballchasing (visor 3D)

// ── Espera a que un servidor HTTP responda ────────────────────────────────────
function waitForServer(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt  = () => {
      http.get(url, res => {
        if (res.statusCode < 500) return resolve()
        if (Date.now() > deadline)  return reject(new Error(`Timeout: ${url}`))
        setTimeout(attempt, 600)
      }).on('error', () => {
        if (Date.now() > deadline) return reject(new Error(`Timeout: ${url}`))
        setTimeout(attempt, 600)
      })
    }
    attempt()
  })
}

// ── Lanza el backend Python (solo si no está ya corriendo) ───────────────────
async function startBackend() {
  // Si ya hay un backend en :8000, no lo volvemos a lanzar
  const alreadyUp = await new Promise(resolve => {
    http.get(`${BACKEND_URL}/api/status`, res => {
      resolve(res.statusCode < 500)
    }).on('error', () => resolve(false))
  })
  if (alreadyUp) {
    console.log('[backend] ya estaba corriendo, reutilizando')
    return
  }
  spawnBackend()
}

// Lanza el proceso del backend (sin comprobar si ya está arriba)
// Intérprete del backend: el del entorno virtual del proyecto (.venv, lo crea setup.bat).
// Así la app no depende de qué "python" haya primero en el PATH: instalar otra versión de
// Python en el sistema dejaba al backend sin sus dependencias. Solo si no existe el venv
// se cae al python global.
function backendPython() {
  const venvPy = process.platform === 'win32'
    ? path.join(ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(ROOT, '.venv', 'bin', 'python')
  if (fs.existsSync(venvPy)) return venvPy
  console.warn('[backend] no existe .venv; usando el python del PATH (ejecuta setup.bat)')
  return process.platform === 'win32' ? 'python' : 'python3'
}

function spawnBackend() {
  const pythonCmd = backendPython()
  backendProc = spawn(pythonCmd, ['main.py'], {
    cwd:      path.join(ROOT, 'backend'),
    stdio:    'pipe',
    detached: false,
    shell:    false,
  })
  backendProc.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProc.stderr.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProc.on('exit', code => console.log('[backend] exited:', code))
}

// Espera (hasta timeout) a que el backend responda en /api/status
function waitForBackend(timeoutMs = 20000) {
  const start = Date.now()
  return new Promise(resolve => {
    const tryOnce = () => {
      http.get(`${BACKEND_URL}/api/status`, res => {
        if (res.statusCode < 500) resolve(true)
        else retry()
      }).on('error', retry)
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) return resolve(false)
      setTimeout(tryOnce, 500)
    }
    tryOnce()
  })
}

// Reinicia el backend en segundo plano sin cerrar la ventana de la app.
// Devuelve { ok } o { ok:false, reason:'external' } si el backend no lo gestiona Electron.
async function restartBackend() {
  if (!backendProc) return { ok: false, reason: 'external' }
  const old = backendProc
  backendProc = null
  await new Promise(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    old.once('exit', finish)
    killTree(old)   // el python.exe del .venv es un lanzador: hay que matar también su hijo
    setTimeout(finish, 4000)   // fallback por si no emite 'exit'
  })
  await new Promise(r => setTimeout(r, 1000))   // dar tiempo a liberar el puerto :8000
  spawnBackend()
  const up = await waitForBackend(20000)
  return { ok: up }
}

// ── Lanza el servidor de desarrollo Vite ─────────────────────────────────────
async function startFrontend() {
  // Si ya hay un frontend en :5173, no lo volvemos a lanzar
  const alreadyUp = await new Promise(resolve => {
    http.get(FRONTEND_URL, res => {
      resolve(res.statusCode < 500)
    }).on('error', () => resolve(false))
  })
  if (alreadyUp) {
    console.log('[frontend] ya estaba corriendo, reutilizando')
    return
  }
  // En Windows npm necesita shell:true para ejecutarse correctamente
  frontendProc = spawn('npm', ['run', 'dev'], {
    cwd:   path.join(ROOT, 'frontend'),
    stdio: 'pipe',
    shell: true,   // imprescindible en Windows para npm
  })
  frontendProc.stdout.on('data', d => console.log('[frontend]', d.toString().trim()))
  frontendProc.stderr.on('data', d => console.error('[frontend]', d.toString().trim()))
}

// ── Destruye la vista embebida de Ballchasing ────────────────────────────────
function destroyBcView() {
  if (!bcView) return
  try { mainWindow?.contentView.removeChildView(bcView) } catch (_) {}
  try { bcView.webContents.close() } catch (_) {}
  bcView = null
}

// ── Mata un proceso hijo con todo su árbol ────────────────────────────────────
// En Windows, frontendProc es un cmd.exe (shell:true) y .kill() solo mata ese cmd: Vite y
// esbuild quedaban huérfanos ocupando :5173 y bloqueando frontend/node_modules.
function killTree(proc) {
  if (!proc || proc.exitCode !== null) return
  if (process.platform === 'win32' && proc.pid) {
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return }
    catch (_) { /* ya había terminado */ }
  }
  try { proc.kill() } catch (_) {}
}

// Espera a que un proceso termine (o hasta timeout)
function waitExit(proc, timeoutMs = 5000) {
  if (!proc || proc.exitCode !== null) return Promise.resolve()
  return new Promise(resolve => {
    const t = setTimeout(resolve, timeoutMs)
    proc.once('exit', () => { clearTimeout(t); resolve() })
  })
}

// ── Mata todos los procesos hijo ──────────────────────────────────────────────
function killAll() {
  destroyBcView()
  killTree(backendProc)
  killTree(frontendProc)
}

// ── Crea la ventana principal ─────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1440,
    height:          900,
    minWidth:        960,
    minHeight:       600,
    icon:            path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    title:           'RLAnalyzer',
    show:            false,
    frame:           false,   // Quita la barra nativa de Windows
    backgroundColor: '#04101E',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
      webviewTag:       true,   // permite usar <webview> para embeber sitios externos
    },
  })

  // Notifica al renderer cuando la ventana cambia de maximizado
  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximized'))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:unmaximized'))

  // Los links externos se abren en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })
  mainWindow.on('closed', () => { mainWindow = null })

  // Muestra una pantalla de carga mientras arrancan los servidores
  showLoadingScreen('Iniciando servicios…')

  mainWindow.show()

  await startServicesAndLoad()

  // Comprueba si hay actualizaciones un rato después de arrancar y luego cada pocas horas
  setTimeout(backgroundUpdateCheck, 20_000)
  setInterval(backgroundUpdateCheck, UPDATE_CHECK_EVERY_MS)
}

// Arranca backend y frontend (reutilizándolos si ya corren) y carga la interfaz
async function startServicesAndLoad() {
  await Promise.all([startBackend(), startFrontend()])
  try {
    await Promise.all([
      waitForServer(`${BACKEND_URL}/api/status`),
      waitForServer(FRONTEND_URL),
    ])
    console.log('[electron] Servidores listos, cargando app...')
  } catch (err) {
    console.error('[electron] Error esperando servidores:', err.message)
    // Intenta cargar de todos modos
  }
  if (mainWindow) mainWindow.loadURL(FRONTEND_URL)
}

// Pantalla de carga (data URL, no depende de Vite). El texto se puede cambiar después
// con setLoadingMessage (se usa durante las actualizaciones).
function showLoadingScreen(message) {
  if (!mainWindow) return Promise.resolve()
  return mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        background: #04101E;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100vh;
        font-family: 'Segoe UI', sans-serif;
        color: #6A90BC;
      }
      img { width: 96px; height: 96px; border-radius: 22px; margin-bottom: 24px; }
      h1  { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: 2px; margin-bottom: 6px; }
      p   { font-size: 13px; opacity: 0.6; margin-bottom: 32px; }
      .spinner {
        width: 32px; height: 32px; border: 3px solid #0D2A48;
        border-top-color: #00A8FF; border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    </head>
    <body>
      <div class="spinner"></div>
      <br>
      <h1>RLAnalyzer</h1>
      <p id="msg">${escapeHtml(message)}</p>
    </body>
    </html>
  `)}`).catch(() => {})
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function setLoadingMessage(message) {
  mainWindow?.webContents
    .executeJavaScript(`document.getElementById('msg') && (document.getElementById('msg').textContent = ${JSON.stringify(message)})`)
    .catch(() => {})
}

// ── Actualizaciones ───────────────────────────────────────────────────────────
// La app corre desde un clon de git: actualizar = fast-forward de main + dependencias que
// hayan cambiado + relanzar (main.js también puede haber cambiado). Ver updater.js.
const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const updater = createUpdater({ root: ROOT, python: backendPython(), log: console.log })
let lastCheck    = null    // último resultado de updater.check()
let lastNotified = null    // sha remoto del que ya se avisó con un toast
let updating     = false
let lastUpdateError = null

async function checkForUpdates() {
  lastCheck = await updater.check()
  console.log('[update]', lastCheck.state, lastCheck.behind ?? '', lastCheck.error ?? lastCheck.blocked ?? '')
  return lastCheck
}

async function backgroundUpdateCheck() {
  if (updating) return
  const r = await checkForUpdates()
  if (r.state !== 'available') return
  mainWindow?.webContents.send('update:available', r)
  if (lastNotified !== r.remote && Notification.isSupported()) {
    lastNotified = r.remote
    const n = new Notification({
      title: 'RLAnalyzer: actualización disponible',
      body:  `${r.behind} cambio(s) nuevos. Ábrela desde Ajustes ▸ Actualizaciones.`,
      icon:  NOTIFY_ICON,
    })
    n.on('click', () => mainWindow?.show())
    n.show()
  }
}

// Para backend y frontend. Solo se puede si los lanzó esta app (si no, no podemos
// garantizar que suelten los archivos que hay que reemplazar).
async function stopServices() {
  if (!backendProc || !frontendProc) {
    throw new Error('El backend o el frontend se lanzaron fuera de la app. Ciérralos y vuelve a intentarlo.')
  }
  const procs = [backendProc, frontendProc]
  backendProc = frontendProc = null
  destroyBcView()
  procs.forEach(killTree)
  await Promise.all(procs.map(p => waitExit(p)))
  await new Promise(r => setTimeout(r, 1000))   // margen para que Windows libere archivos y puertos
}

// Relanza la app por start-app.bat (vía launch.vbs, sin consola): así, si cambiaron las
// dependencias de Electron, se instalan cuando este proceso ya ha salido.
function relaunchApp() {
  const vbs = path.join(ROOT, 'launch.vbs')
  if (process.platform === 'win32' && fs.existsSync(vbs)) {
    spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } else {
    app.relaunch()
  }
  app.exit(0)
}

async function applyUpdate() {
  if (updating) return { ok: false, error: 'Ya se está actualizando' }
  if (!backendProc || !frontendProc) {
    return { ok: false, error: 'El backend o el frontend se lanzaron fuera de la app. Ciérralos y abre RLAnalyzer de nuevo para actualizar.' }
  }
  updating = true
  lastUpdateError = null
  await showLoadingScreen('Actualizando…')
  const result = await updater.apply({ stopServices, onProgress: setLoadingMessage })
  if (result.ok) {
    setLoadingMessage('Actualizado. Reiniciando…')
    setTimeout(relaunchApp, 800)
    return result
  }
  // Fallo: la versión anterior está restaurada (o no se llegó a tocar). Volver a arrancar.
  lastUpdateError = result.error
  console.error('[update] fallo:', result.error, '| revertido:', result.rolledBack)
  setLoadingMessage('No se pudo actualizar. Volviendo a la versión actual…')
  updating = false
  await startServicesAndLoad()
  return result
}

// ── IPC: controles de ventana ─────────────────────────────────────────────────
ipcMain.handle('window:minimize',    () => mainWindow?.minimize())
ipcMain.handle('window:maximize',    () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.handle('window:close',       () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── IPC: gestión de archivos de replay ────────────────────────────────────────
ipcMain.handle('replay:showInFolder', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Archivo no encontrado' }
  shell.showItemInFolder(filePath)
  return { ok: true }
})

ipcMain.handle('replay:export', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Archivo no encontrado' }

  const fileName = path.basename(filePath)
  const { canceled, filePath: dest } = await dialog.showSaveDialog(mainWindow, {
    title:       'Exportar replay',
    defaultPath: fileName,
    filters:     [{ name: 'Rocket League Replay', extensions: ['replay'] }],
  })

  if (canceled || !dest) return { ok: false, canceled: true }

  try {
    fs.copyFileSync(filePath, dest)
    return { ok: true, dest }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('dialog:selectFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title:      'Selecciona la carpeta de replays',
    properties: ['openDirectory'],
  })
  if (canceled || !filePaths?.length) return { ok: false, canceled: true }
  return { ok: true, path: filePaths[0] }
})

ipcMain.handle('backend:restart', () => restartBackend())

// ── IPC: actualizaciones ──────────────────────────────────────────────────────
ipcMain.handle('update:status', async () => ({
  local:     await updater.localState().catch(e => ({ supported: false, reason: 'error', error: e.message })),
  lastCheck,
  lastError: lastUpdateError,
  managed:   !!(backendProc && frontendProc),
}))
ipcMain.handle('update:check', () => checkForUpdates())
ipcMain.handle('update:apply', () => {
  console.log('[update] aplicación solicitada desde la interfaz')   // nunca se aplica sin pulsar
  return applyUpdate()
})

// ── IPC: notificaciones del sistema (toast nativo de Windows/macOS) ───────────
// Se disparan desde el proceso PRINCIPAL (no con el new Notification() del renderer):
// en Windows, los toasts del renderer se descartan en silencio si la app no tiene
// AppUserModelId. Desde aquí, con setAppUserModelId fijado, sí aparecen.
const NOTIFY_ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
ipcMain.handle('notify:show', (_event, { title, body } = {}) => {
  const supported = Notification.isSupported()
  console.log('[notify] isSupported=', supported, '| title=', title)
  if (!supported) return { ok: false, reason: 'unsupported' }
  try {
    const n = new Notification({ title: title || 'RLAnalyzer', body: body || '', icon: NOTIFY_ICON, silent: false })
    n.on('show',   ()            => console.log('[notify] mostrada'))
    n.on('failed', (_e, err)     => console.error('[notify] failed:', err))
    n.on('click',  ()            => mainWindow?.show())
    n.show()
    return { ok: true, supported }
  } catch (err) {
    console.error('[notify] error:', err)
    return { ok: false, error: err.message }
  }
})

// ── IPC: visor embebido de Ballchasing (WebContentsView) ──────────────────────
// Usamos WebContentsView en lugar de <webview> porque comparte la misma ruta de
// render de Chromium que la ventana principal (WebGL/GPU real), de modo que el
// visor 3D de Ballchasing se renderiza correctamente, como un navegador metido
// dentro de la app.
function roundBounds(b) {
  return {
    x:      Math.round(b?.x ?? 0),
    y:      Math.round(b?.y ?? 0),
    width:  Math.max(0, Math.round(b?.width  ?? 0)),
    height: Math.max(0, Math.round(b?.height ?? 0)),
  }
}

ipcMain.handle('bcview:open', (_event, url, bounds) => {
  if (!mainWindow) return { ok: false, error: 'No window' }
  // Si ya existe, solo navegamos y reposicionamos
  if (!bcView) {
    bcView = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    bcView.setBackgroundColor('#04090F')
    mainWindow.contentView.addChildView(bcView)
    // Los popups/links externos se abren en el navegador del sistema
    bcView.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }
  bcView.setBounds(roundBounds(bounds))
  if (url) bcView.webContents.loadURL(url)
  return { ok: true }
})

ipcMain.handle('bcview:setBounds', (_event, bounds) => {
  if (!bcView) return { ok: false }
  bcView.setBounds(roundBounds(bounds))
  return { ok: true }
})

ipcMain.handle('bcview:close', () => {
  destroyBcView()
  return { ok: true }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────
Menu.setApplicationMenu(null)   // Elimina la barra de menú nativa (File/Edit/…)

// Identidad de la app para Windows: imprescindible para que los toasts de notificación
// se muestren. Hay que registrarla en el registro (registerAumidForToasts) y fijarla con
// setAppUserModelId; ambas con el MISMO id. Inofensivo en otras plataformas.
registerAumidForToasts()
app.setAppUserModelId(AUMID)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  killAll()
  app.quit()
})

app.on('before-quit', killAll)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
