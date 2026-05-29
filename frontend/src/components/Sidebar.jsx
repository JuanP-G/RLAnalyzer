import { NavLink } from 'react-router-dom'

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" opacity="0.9"/>
      <rect x="8.5" y="1" width="6.5" height="6.5" rx="1.5" opacity="0.9"/>
      <rect x="1" y="8.5" width="6.5" height="6.5" rx="1.5" opacity="0.9"/>
      <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1.5" opacity="0.9"/>
    </svg>
  )
}
function IconReplays() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="2" width="14" height="12" rx="2" opacity="0.25"/>
      <polygon points="6,4.5 12.5,8 6,11.5" opacity="1"/>
      <rect x="1" y="2" width="2.5" height="3" rx="0.5" opacity="0.7"/>
      <rect x="12.5" y="2" width="2.5" height="3" rx="0.5" opacity="0.7"/>
      <rect x="1" y="11" width="2.5" height="3" rx="0.5" opacity="0.7"/>
      <rect x="12.5" y="11" width="2.5" height="3" rx="0.5" opacity="0.7"/>
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="5" r="3.2" opacity="0.9"/>
      <path d="M1.5 14c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" opacity="0.7" strokeLinecap="round"/>
    </svg>
  )
}
function IconViewer3D() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <polygon points="8,1.5 14,5 14,11 8,14.5 2,11 2,5" opacity="0.2" fill="currentColor" stroke="none"/>
      <polyline points="8,1.5 14,5 8,8.5 2,5 8,1.5"/>
      <line x1="8"  y1="8.5" x2="8"  y2="14.5"/>
      <line x1="14" y1="5"   x2="14" y2="11"/>
      <line x1="2"  y1="5"   x2="2"  y2="11"/>
      <line x1="8"  y1="14.5" x2="2"  y2="11"/>
      <line x1="8"  y1="14.5" x2="14" y2="11"/>
    </svg>
  )
}
function IconAnalysis() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 14.5h13" opacity="0.7" />
      <rect x="2.5" y="8"  width="2.6" height="5" rx="0.6" fill="currentColor" stroke="none" opacity="0.55" />
      <rect x="6.7" y="4.5" width="2.6" height="8.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.8" />
      <rect x="10.9" y="6.5" width="2.6" height="6.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.65" />
    </svg>
  )
}
const links = [
  { to: '/profile',  label: 'Mi Perfil',  Icon: IconProfile },
  { to: '/',         label: 'Dashboard',  Icon: IconDashboard },
  { to: '/replays',  label: 'Partidas',   Icon: IconReplays },
  { to: '/analysis', label: 'Análisis',   Icon: IconAnalysis },
  { to: '/viewer',   label: 'Visor 3D',   Icon: IconViewer3D },
]

export default function Sidebar({ playerName, folderOk }) {
  return (
    <aside
      className="w-56 h-full flex-shrink-0 flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #081A30 0%, #04101E 100%)',
        borderRight: '1px solid #122A4D',
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid #122A4D' }}>
        <div className="flex items-center gap-3">
          <img
            src="/favicon-256x256.png"
            alt="RLAnalyzer"
            className="w-9 h-9 rounded-lg flex-shrink-0"
            style={{ objectFit: 'cover' }}
          />
          <div>
            <h1
              className="font-display font-bold text-white leading-none"
              style={{ fontSize: '1.05rem', letterSpacing: '0.07em' }}
            >
              RL<span style={{ color: '#00A8FF' }}>Analyzer</span>
            </h1>
            <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: '#284F74' }}>
              Match Analytics
            </p>
          </div>
        </div>

        {playerName && (
          <div className="mt-4 flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-glow"
              style={{ background: '#00A8FF', boxShadow: '0 0 6px #00A8FF' }}
            />
            <p className="text-xs truncate" style={{ color: '#436D96' }}>{playerName}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5">
        {links.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive ? 'text-white' : 'text-gray-500 hover:text-gray-200'
              }`
            }
            style={({ isActive }) => isActive
              ? {
                  background: 'linear-gradient(90deg, rgba(0,168,255,0.13) 0%, rgba(0,168,255,0.04) 100%)',
                  border: '1px solid rgba(0,168,255,0.20)',
                }
              : { background: 'transparent', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                    style={{ background: '#00A8FF', boxShadow: '0 0 8px rgba(0,168,255,0.7)' }}
                  />
                )}
                <span className={isActive ? 'text-rl-blue' : 'text-gray-600 group-hover:text-gray-400 transition-colors'}>
                  <Icon />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Estado watcher */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid #122A4D' }}>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${folderOk ? 'animate-glow' : ''}`}
            style={{
              background: folderOk ? '#3DDB85' : '#FF4757',
              boxShadow: folderOk ? '0 0 6px rgba(61,219,133,0.7)' : 'none',
            }}
          />
          <span className="text-xs" style={{ color: '#284F74' }}>
            {folderOk ? 'Watcher activo' : 'Carpeta no encontrada'}
          </span>
        </div>
      </div>
    </aside>
  )
}
