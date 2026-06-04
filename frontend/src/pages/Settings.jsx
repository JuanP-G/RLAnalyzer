import { useEffect, useState } from 'react'
import { api, invalidateProfileCache } from '../api'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// ── Campo de texto reutilizable ───────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div className="mb-5">
      <label className="block text-[11px] uppercase tracking-wider text-gray-400 font-display font-semibold mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

const inputStyle = {
  background: '#071829',
  border: '1px solid #122A4D',
  color: '#C2D6F5',
}

export default function Settings({ onSaved }) {
  const [data, setData]     = useState(null)
  const [name, setName]     = useState('')
  const [folder, setFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)   // { type: 'ok'|'err', text }

  const load = () => {
    setLoading(true)
    api.getSettings()
      .then(d => { setData(d); setName(d.player_name || ''); setFolder(d.replays_folder || '') })
      .catch(e => setMsg({ type: 'err', text: e.message }))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const browse = async () => {
    if (!isElectron) return
    const res = await window.electronAPI.selectFolder()
    if (res?.ok && res.path) setFolder(res.path)
  }

  const dirty = data && (name.trim() !== (data.player_name || '') || folder.trim() !== (data.replays_folder || ''))

  const save = async () => {
    if (!dirty) return
    setSaving(true); setMsg(null)
    const payload = {}
    if (name.trim() !== (data.player_name || ''))     payload.player_name = name.trim()
    if (folder.trim() !== (data.replays_folder || '')) payload.replays_folder = folder.trim()
    try {
      const res = await api.updateSettings(payload)
      if (payload.player_name) await invalidateProfileCache()
      setData(res); setName(res.player_name || ''); setFolder(res.replays_folder || '')
      setMsg({ type: 'ok', text: 'Ajustes guardados.' })
      onSaved?.()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="h-full flex items-center justify-center text-gray-500">Cargando ajustes…</div>
  )

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="max-w-xl">
        <h1 className="font-display font-bold text-gray-100 uppercase tracking-wider text-xl mb-1">Ajustes</h1>
        <p className="text-gray-500 text-sm mb-6">Configura tu jugador principal y la carpeta de replays.</p>

        {/* ── Jugador principal ─────────────────────────────────────────── */}
        <div className="bg-bg-secondary rounded-xl p-5 mb-5" style={{ border: '1px solid #122A4D' }}>
          <Field label="Jugador principal"
                 hint="Tus estadísticas y tu perfil se calculan para este jugador. Al cambiarlo se recalcula sobre las partidas existentes.">
            <input
              list="known-players"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre exacto en Rocket League"
              className="w-full text-sm rounded-md px-3 py-2 outline-none"
              style={inputStyle}
            />
            <datalist id="known-players">
              {(data?.known_players || []).map(p => <option key={p} value={p} />)}
            </datalist>
          </Field>
        </div>

        {/* ── Carpeta de replays ────────────────────────────────────────── */}
        <div className="bg-bg-secondary rounded-xl p-5 mb-5" style={{ border: '1px solid #122A4D' }}>
          <Field label="Carpeta de replays"
                 hint={isElectron
                   ? 'Carpeta que se vigila para procesar nuevos .replay automáticamente.'
                   : 'En el navegador, escribe la ruta a mano (el selector nativo solo está en la app de escritorio).'}>
            <div className="flex gap-2">
              <input
                value={folder}
                onChange={e => setFolder(e.target.value)}
                placeholder="C:\\…\\Rocket League\\TAGame\\DemosEpic"
                className="flex-1 text-sm rounded-md px-3 py-2 outline-none font-mono-num"
                style={inputStyle}
              />
              {isElectron && (
                <button onClick={browse}
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-white transition-all flex-shrink-0"
                  style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
                  Examinar…
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: data?.folder_exists ? '#3DDB85' : '#FF4757' }} />
              <span className="text-[11px]" style={{ color: data?.folder_exists ? '#3DDB85' : '#FF4757' }}>
                {data?.folder_exists ? 'La carpeta existe' : 'La carpeta no existe en este equipo'}
              </span>
            </div>
          </Field>
        </div>

        {/* ── Guardar ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.45)', color: '#fff' }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {msg && (
            <span className="text-sm" style={{ color: msg.type === 'ok' ? '#3DDB85' : '#FF4757' }}>
              {msg.text}
            </span>
          )}
        </div>

        {/* ── Solo lectura (requieren reiniciar) ────────────────────────── */}
        <div className="mt-8">
          <h2 className="font-display font-semibold text-gray-400 text-[10px] uppercase tracking-widest mb-2">
            Avanzado (requiere reiniciar el backend)
          </h2>
          <div className="bg-bg-secondary rounded-xl p-4 text-xs text-gray-500 space-y-1 font-mono-num"
               style={{ border: '1px solid #122A4D' }}>
            <p>Puerto backend: <span className="text-gray-300">{data?.backend_port}</span></p>
            <p>Base de datos: <span className="text-gray-300">{data?.db_path}</span></p>
            <p>Zona horaria: <span className="text-gray-300">{data?.timezone}</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
