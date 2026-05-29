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
import { api } from './api'

export default function App() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
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
    </div>
  )
}
