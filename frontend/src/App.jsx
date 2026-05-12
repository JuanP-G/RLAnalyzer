import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ReplayList from './pages/ReplayList'
import ReplayDetail from './pages/ReplayDetail'
import Profile from './pages/Profile'
import { api } from './api'

export default function App() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
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
          <Route path="/profile"        element={<Profile />} />
        </Routes>
      </main>
    </div>
  )
}
