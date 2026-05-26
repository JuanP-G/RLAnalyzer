import { useEffect, useState } from 'react'

// Detecta si estamos dentro de Electron
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isElectron) return
    // Estado inicial
    window.electronAPI.isMaximized().then(setMaximized)
    // Escucha cambios
    window.electronAPI.onMaximizeChange(setMaximized)
  }, [])

  if (!isElectron) return null   // En navegador no mostramos nada

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 select-none"
      style={{
        height: '36px',
        background: '#030E1A',
        borderBottom: '1px solid #0A1E35',
        WebkitAppRegion: 'drag',   // Toda la barra es arrastrable
      }}
    >
      {/* Logo + título */}
      <div className="flex items-center gap-2 pl-3">
        <img
          src="/rl-logo.png"
          alt=""
          className="w-4 h-4 object-contain opacity-80"
          onError={e => { e.target.style.display = 'none' }}
        />
        <span className="text-xs font-semibold tracking-widest" style={{ color: '#2A5A8A', letterSpacing: '0.15em' }}>
          RLANALYZER
        </span>
      </div>

      {/* Botones de control — no arrastrables */}
      <div
        className="flex items-stretch h-full"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* Minimizar */}
        <button
          onClick={() => window.electronAPI.minimize()}
          className="flex items-center justify-center transition-colors duration-150"
          style={{ width: '46px', color: '#3A6080' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0D2A48'; e.currentTarget.style.color = '#90B8D8' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3A6080' }}
          title="Minimizar"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" rx="0.5"/>
          </svg>
        </button>

        {/* Maximizar / Restaurar */}
        <button
          onClick={() => window.electronAPI.maximize()}
          className="flex items-center justify-center transition-colors duration-150"
          style={{ width: '46px', color: '#3A6080' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0D2A48'; e.currentTarget.style.color = '#90B8D8' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3A6080' }}
          title={maximized ? 'Restaurar' : 'Maximizar'}
        >
          {maximized ? (
            /* Icono restaurar (dos cuadros solapados) */
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2.5" y="0.5" width="7" height="7" rx="0.5"/>
              <path d="M0.5 2.5v7h7" />
            </svg>
          ) : (
            /* Icono maximizar (cuadro simple) */
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5"/>
            </svg>
          )}
        </button>

        {/* Cerrar */}
        <button
          onClick={() => window.electronAPI.close()}
          className="flex items-center justify-center transition-colors duration-150"
          style={{ width: '46px', color: '#3A6080' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#C0392B'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3A6080' }}
          title="Cerrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9"/>
            <line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
