const { app, BrowserWindow, shell } = require('electron')
const { spawn }                      = require('child_process')
const path                           = require('path')
const http                           = require('http')

const ROOT = path.join(__dirname, '..')

let mainWindow
let backendProc
let frontendProc

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
    http.get('http://localhost:8000/api/status', res => {
      resolve(res.statusCode < 500)
    }).on('error', () => resolve(false))
  })
  if (alreadyUp) {
    console.log('[backend] ya estaba corriendo, reutilizando')
    return
  }
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
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

// ── Lanza el servidor de desarrollo Vite ─────────────────────────────────────
async function startFrontend() {
  // Si ya hay un frontend en :5173, no lo volvemos a lanzar
  const alreadyUp = await new Promise(resolve => {
    http.get('http://localhost:5173', res => {
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

// ── Mata todos los procesos hijo ──────────────────────────────────────────────
function killAll() {
  try { if (backendProc)  backendProc.kill()  } catch (_) {}
  try { if (frontendProc) frontendProc.kill() } catch (_) {}
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
    backgroundColor: '#04101E',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  })

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
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
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
      <p>Iniciando servicios…</p>
    </body>
    </html>
  `)}`)

  mainWindow.show()

  // Arranca backend y frontend en paralelo (esperan si ya corren)
  await Promise.all([startBackend(), startFrontend()])

  // Espera a que estén listos
  try {
    await Promise.all([
      waitForServer('http://localhost:8000/api/status'),
      waitForServer('http://localhost:5173'),
    ])
    console.log('[electron] Servidores listos, cargando app...')
    if (mainWindow) mainWindow.loadURL('http://localhost:5173')
  } catch (err) {
    console.error('[electron] Error esperando servidores:', err.message)
    // Intenta cargar de todos modos
    if (mainWindow) mainWindow.loadURL('http://localhost:5173')
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  killAll()
  app.quit()
})

app.on('before-quit', killAll)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
