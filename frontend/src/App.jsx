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

  // Notificaciones del sistema sobre el procesado de replays (cada tipo pausable en Ajustes).
  useEffect(() => {
    let seq = 0
    let timer = null
    // Toggle por tipo de aviso; el backend ya manda title/body localizados.
    const enabled = { corrupt: true, match_added: true, parse_error: true }

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const poll = async () => {
      try {
        const data = await api.notifications(seq)
        for (const ev of data.events || []) {
          if (enabled[ev.type] !== false && typeof Notification !== 'undefined') {
            try {
              new Notification(ev.title, { body: ev.body })
            } catch { /* permiso denegado / no soportado */ }
          }
        }
        if (data.last_seq != null) seq = data.last_seq
      } catch { /* backend caído: reintentar luego */ }
    }

    // Baseline: no notificar la cola previa; leer los flags y arrancar el sondeo
    api.getSettings()
      .then(s => {
        enabled.corrupt     = s.notify_corrupt     !== false
        enabled.match_added = s.notify_match_added !== false
        enabled.parse_error = s.notify_parse_error !== false
      })
      .catch(() => {})
    api.notifications(0)
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
