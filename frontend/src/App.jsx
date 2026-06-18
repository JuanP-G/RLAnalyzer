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

  // Notificaciones del sistema sobre el procesado de replays. El backend filtra por los
  // toggles de Ajustes (frescos en cada sondeo) y manda title/body listos para mostrar, así
  // que aquí solo hay que mostrar lo que llegue → activar/desactivar surte efecto sin recargar.
  useEffect(() => {
    let seq = 0
    let timer = null
    let cancelled = false   // evita un 2º intervalo fugado (StrictMode monta el efecto 2 veces)

    // En la app de escritorio se usa el toast NATIVO (proceso principal de Electron): en
    // Windows el new Notification() del renderer se descarta si la app no tiene identidad.
    // En el navegador se cae al Web Notifications API (pidiendo permiso si hace falta).
    const electronNotify = window.electronAPI?.notify
    if (!electronNotify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const show = (title, body) => {
      if (electronNotify) {
        electronNotify(title, body)
      } else if (typeof Notification !== 'undefined') {
        try { new Notification(title, { body }) } catch { /* permiso denegado / no soportado */ }
      }
    }

    const poll = async () => {
      try {
        const data = await api.notifications(seq)
        for (const ev of data.events || []) show(ev.title, ev.body)
        if (data.last_seq != null) seq = data.last_seq
      } catch { /* backend caído: reintentar luego */ }
    }

    // Baseline: no notificar la cola previa; arrancar el sondeo desde el último seq
    api.notifications(0)
      .then(d => { seq = d.last_seq || 0 })
      .catch(() => {})
      .finally(() => { if (!cancelled) timer = setInterval(poll, 30000) })

    return () => { cancelled = true; if (timer) clearInterval(timer) }
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
