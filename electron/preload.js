const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Controles de ventana
  minimize:    ()  => ipcRenderer.invoke('window:minimize'),
  maximize:    ()  => ipcRenderer.invoke('window:maximize'),
  close:       ()  => ipcRenderer.invoke('window:close'),
  isMaximized: ()  => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (cb) => {
    ipcRenderer.on('window:maximized',   () => cb(true))
    ipcRenderer.on('window:unmaximized', () => cb(false))
  },

  // Gestión de archivos de replay
  showReplayInFolder: (filePath) => ipcRenderer.invoke('replay:showInFolder', filePath),
  exportReplay:       (filePath) => ipcRenderer.invoke('replay:export', filePath),

  // Diálogos nativos
  selectFolder:       ()         => ipcRenderer.invoke('dialog:selectFolder'),

  // Reinicia el backend en segundo plano (sin cerrar la ventana)
  restartBackend:     ()         => ipcRenderer.invoke('backend:restart'),

  // Notificación del sistema (toast nativo, vía proceso principal)
  notify:             (title, body) => ipcRenderer.invoke('notify:show', { title, body }),

  // Visor embebido de Ballchasing (WebContentsView)
  bcViewOpen:      (url, bounds) => ipcRenderer.invoke('bcview:open', url, bounds),
  bcViewSetBounds: (bounds)      => ipcRenderer.invoke('bcview:setBounds', bounds),
  bcViewClose:     ()            => ipcRenderer.invoke('bcview:close'),
})
