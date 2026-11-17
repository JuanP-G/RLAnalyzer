import { useEffect, useState } from 'react'
import { updatesSupported } from './UpdatePanel'

// Aviso fino bajo la barra de título cuando hay una actualización aplicable.
// El proceso principal de Electron comprueba al arrancar y cada 6 h (update:available).
export default function UpdateBanner({ onOpenSettings }) {
  const [info, setInfo]         = useState(null)
  const [dismissed, setDismissed] = useState(null)   // sha remoto descartado
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (!updatesSupported) return
    const api = window.electronAPI
    api.updateStatus().then(s => { if (s?.lastCheck?.state === 'available') setInfo(s.lastCheck) }).catch(() => {})
    return api.onUpdateAvailable(setInfo)
  }, [])

  if (!info || info.state !== 'available' || dismissed === info.remote) return null

  const apply = async () => {
    setBusy(true)
    const r = await window.electronAPI.applyUpdate().catch(e => ({ ok: false, error: e.message }))
    if (!r?.ok) { setBusy(false); onOpenSettings?.() }   // el detalle del error se ve en Ajustes
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 text-xs flex-shrink-0"
         style={{ background: 'rgba(0,168,255,0.10)', borderBottom: '1px solid rgba(0,168,255,0.30)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-rl-blue flex-shrink-0" />
      <span className="text-gray-200">
        Nueva versión disponible <span className="text-gray-500">({info.behind} cambio{info.behind === 1 ? '' : 's'})</span>
      </span>
      <button onClick={onOpenSettings} className="text-gray-400 hover:text-white underline-offset-2 hover:underline">
        Ver cambios
      </button>
      <button onClick={apply} disabled={busy}
              className="ml-auto px-2.5 py-0.5 rounded-md font-semibold text-white disabled:opacity-50"
              style={{ background: 'rgba(0,168,255,0.20)', border: '1px solid rgba(0,168,255,0.5)' }}>
        {busy ? 'Actualizando…' : 'Actualizar y reiniciar'}
      </button>
      <button onClick={() => setDismissed(info.remote)} title="Ahora no"
              className="text-gray-500 hover:text-white text-base leading-none px-1">×</button>
    </div>
  )
}
