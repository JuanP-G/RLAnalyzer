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
})
