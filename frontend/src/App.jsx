import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import Dashboard from './pages/Dashboard'
import ReplayList from './pages/ReplayList'
import ReplayDetail from './pages/ReplayDetail'
import ReplayViewer from './pages/ReplayViewer'
import ViewerList from './pages/ViewerList'
import Profile from './pages/Profile'
import PlayerHistory from './pages/PlayerHistory'
import Analysis from './pages/Analysis'
import Compare from './pages/Compare'
import SettingsModal from './components/SettingsModal'
import { api } from './api'

export default function App() {
  const [status, setStatus] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const refreshStatus = () => api.status().then(setStatus).catch(() => {})

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  // Notificación del sistema cuando se descarta una partida corrupta (pausable en Ajustes).
  useEffect(() => {
    let seq = 0
    let notify = true
    let timer = null

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const poll = async () => {
      try {
        const data = await api.rejectedReplays(seq)
        for (const ev of data.events || []) {
          if (notify && typeof Notification !== 'undefined') {
            try {
              new Notification('Partida no añadida', {
                body: `Replay corrupto o sin datos: ${ev.file_name}`,
              })
            } catch { /* permiso denegado / no soportado */ }
          }
        }
        if (data.last_seq != null) seq = data.last_seq
      } catch { /* backend caído: reintentar luego */ }
    }

    // Baseline: no notificar la cola previa; leer el flag y arrancar el sondeo
    api.getSettings()
      .then(s => { notify = s.notify_corrupt !== false })
      .catch(() => {})
    api.rejectedReplays(0)
      .then(d => { seq = d.last_seq || 0 })
      .catch(() => {})
      .finally(() => { timer = setInterval(poll, 30000) })

    return () => { if (timer) clearInterval(timer) }
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-primary">
      {/* Barra de título personalizada (solo visible en Electron) */}
      <TitleBar />

      {/* Contenido principal */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          playerName={status?.player_name}
          folderOk={status?.folder_exists ?? false}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Cada página gestiona su propio padding y scroll */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/"              element={<Dashboard />} />
            <Route path="/replays"       element={<ReplayList />} />
            <Route path="/replays/:id"   element={<ReplayDetail />} />
            <Route path="/analysis"      element={<Analysis />} />
            <Route path="/compare"       element={<Compare />} />
          <Route path="/viewer"          element={<ViewerList />} />
            <Route path="/viewer/:id"      element={<ReplayViewer />} />
            <Route path="/profile"        element={<Profile />} />
            <Route path="/players/:name"  element={<PlayerHistory />} />
          </Routes>
        </main>
      </div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={refreshStatus} />
      )}
    </div>
  )
}
