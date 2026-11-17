import { useEffect, useState } from 'react'

// Actualizaciones de la app de escritorio (ver electron/updater.js).
// La app se ejecuta desde un clon de git: se trae `main` de GitHub, se avanza en
// fast-forward, se instalan solo las dependencias que cambiaron y se reinicia.

const updates = typeof window !== 'undefined' ? window.electronAPI : null
export const updatesSupported = !!updates?.checkForUpdates

const BLOCKED_TEXT = {
  branch:   b => `Esta copia está en la rama «${b}» (desarrollo). Solo se actualiza sola en la rama main.`,
  dirty:    () => 'Hay archivos modificados a mano. Guárdalos o descártalos en git para poder actualizar.',
  diverged: () => 'Esta copia tiene commits que no están en GitHub; no se puede avanzar sin perderlos.',
}

const btn = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50'
const btnStyle = { background: '#0D2240', border: '1px solid #1A3A5C' }
const btnPrimary = { background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.45)', color: '#fff' }

export function ChangeList({ commits, max = 8 }) {
  if (!commits?.length) return null
  return (
    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
      {commits.slice(0, max).map(c => (
        <li key={c.sha} className="text-[11px] text-gray-400 flex gap-2">
          <span className="font-mono-num text-gray-600 flex-shrink-0">{c.date}</span>
          <span className="break-words">{c.subject}</span>
        </li>
      ))}
      {commits.length > max && <li className="text-[11px] text-gray-600">…y {commits.length - max} más</li>}
    </ul>
  )
}

export default function UpdatePanel() {
  const [status, setStatus]   = useState(null)   // { local, lastCheck, lastError, managed }
  const [check, setCheck]     = useState(null)   // resultado de checkForUpdates
  const [busy, setBusy]       = useState(null)   // 'check' | 'apply'
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!updatesSupported) return
    updates.updateStatus().then(s => { setStatus(s); if (s.lastCheck) setCheck(s.lastCheck) }).catch(() => {})
    return updates.onUpdateAvailable(setCheck)
  }, [])

  if (!updatesSupported) {
    return <p className="text-[11px] text-gray-500">Solo disponible en la app de escritorio.</p>
  }

  const doCheck = async () => {
    setBusy('check'); setError(null)
    try { setCheck(await updates.checkForUpdates()) }
    catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  const doApply = async () => {
    setBusy('apply'); setError(null)
    try {
      const r = await updates.applyUpdate()
      // Si va bien la app se reinicia sola; si no, vuelve aquí con el error
      if (!r?.ok) setError(r?.error || 'No se pudo actualizar')
    } catch (e) { setError(e.message) }
    finally { setBusy(null) }
  }

  const local = status?.local
  const version = local?.version ? `v${local.version}` : '—'
  const head = local?.head ? local.head.slice(0, 7) : null

  let line = null
  if (local && !local.supported) {
    line = <span className="text-gray-400">Esta copia no se instaló con <span className="font-mono-num">git clone</span>, así que no puede actualizarse sola. Vuelve a instalarla clonando el repositorio (ver README).</span>
  } else if (check?.state === 'up-to-date') {
    line = <span style={{ color: '#3DDB85' }}>Tienes la última versión.</span>
  } else if (check?.state === 'available') {
    line = <span className="text-white">Hay {check.behind} cambio(s) nuevos.</span>
  } else if (check?.state === 'blocked') {
    line = (
      <span className="text-gray-300">
        Hay {check.behind} cambio(s) en GitHub, pero no se pueden aplicar solos:{' '}
        <span className="text-gray-400">{BLOCKED_TEXT[check.blocked]?.(check.branch) ?? check.blocked}</span>
        {check.blocked === 'dirty' && check.dirtyFiles?.length > 0 && (
          <span className="block mt-1 font-mono-num text-[11px] text-gray-500 break-all">
            {check.dirtyFiles.slice(0, 6).join(' · ')}{check.dirtyFiles.length > 6 ? ` · …(+${check.dirtyFiles.length - 6})` : ''}
          </span>
        )}
      </span>
    )
  } else if (check?.state === 'error') {
    line = <span style={{ color: '#FF4757' }}>No se pudo comprobar: {check.error}</span>
  }

  return (
    <div>
      <div className="text-xs text-gray-500 font-mono-num">
        Versión instalada: <span className="text-gray-300">{version}</span>
        {head && <span className="text-gray-600"> · {head}</span>}
        {local?.branch && local.branch !== 'main' && <span className="text-gray-600"> · rama {local.branch}</span>}
      </div>

      {line && <p className="text-xs mt-2">{line}</p>}
      {(check?.state === 'available' || check?.state === 'blocked') && <ChangeList commits={check.commits} />}

      {status?.lastError && !error && (
        <p className="text-[11px] mt-2" style={{ color: '#FF4757' }}>
          La última actualización falló y se volvió a la versión anterior: {status.lastError}
        </p>
      )}
      {error && <p className="text-[11px] mt-2" style={{ color: '#FF4757' }}>{error}</p>}

      <div className="flex items-center gap-2 mt-3">
        <button onClick={doCheck} disabled={!!busy || (local && !local.supported)}
                className={`${btn} text-gray-300 hover:text-white`} style={btnStyle}>
          {busy === 'check' ? 'Buscando…' : 'Buscar actualizaciones'}
        </button>
        {check?.state === 'available' && (
          <button onClick={doApply} disabled={!!busy} className={`${btn} font-semibold`} style={btnPrimary}>
            {busy === 'apply' ? 'Actualizando…' : 'Actualizar y reiniciar'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">
        Se comprueba sola al abrir la app y cada 6 horas. Antes de actualizar se guarda una copia de la base de datos en data/backups.
      </p>
    </div>
  )
}
