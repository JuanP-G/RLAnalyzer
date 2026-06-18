import { useEffect, useState } from 'react'
import { api, invalidateProfileCache } from '../api'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const inputStyle = { background: '#071829', border: '1px solid #122A4D', color: '#C2D6F5' }

// Sección con título — facilita añadir nuevas (Apariencia, Privacidad, Actualizaciones…)
function Section({ title, desc, children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#04101E', border: '1px solid #122A4D' }}>
      <h3 className="font-display font-semibold text-gray-200 text-xs uppercase tracking-widest">{title}</h3>
      {desc && <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{desc}</p>}
      {!desc && <div className="mb-3" />}
      {children}
    </div>
  )
}

export default function SettingsModal({ onClose, onSaved }) {
  const [data, setData]     = useState(null)
  const [name, setName]     = useState('')
  const [folder, setFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [msg, setMsg]         = useState(null)   // { type:'ok'|'err', text }

  const [status, setStatus] = useState(null)   // progreso de stats avanzadas

  useEffect(() => {
    api.getSettings()
      .then(d => { setData(d); setName(d.player_name || ''); setFolder(d.replays_folder || '') })
      .catch(e => setMsg({ type: 'err', text: e.message }))
      .finally(() => setLoading(false))
    api.advancedStatus().then(setStatus).catch(() => {})
  }, [])

  const toggleBackground = async (val) => {
    setData(d => ({ ...d, advanced_background: val }))   // optimista
    try {
      await api.updateSettings({ advanced_background: val })
    } catch (e) {
      setData(d => ({ ...d, advanced_background: !val }))   // revertir
      setMsg({ type: 'err', text: e.message })
    }
  }

  // Toggle genérico para cualquier flag de notificación (optimista + revertir si falla).
  const toggleNotify = async (key, val) => {
    setData(d => ({ ...d, [key]: val }))
    try {
      await api.updateSettings({ [key]: val })
    } catch (e) {
      setData(d => ({ ...d, [key]: !val }))
      setMsg({ type: 'err', text: e.message })
    }
  }

  // Cerrar con Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const browse = async () => {
    if (!isElectron) return
    const res = await window.electronAPI.selectFolder()
    if (res?.ok && res.path) setFolder(res.path)
  }

  const dirty = data && (name.trim() !== (data.player_name || '') || folder.trim() !== (data.replays_folder || ''))

  const save = async () => {
    if (!dirty) return
    if (!name.trim())   { setMsg({ type: 'err', text: 'El jugador no puede estar vacío.' });  return }
    if (!folder.trim()) { setMsg({ type: 'err', text: 'La carpeta no puede estar vacía.' }); return }
    setSaving(true); setMsg(null)
    const payload = {}
    if (name.trim() !== (data.player_name || ''))      payload.player_name = name.trim()
    if (folder.trim() !== (data.replays_folder || '')) payload.replays_folder = folder.trim()
    try {
      const res = await api.updateSettings(payload)
      if (payload.player_name) await invalidateProfileCache()
      setData(res); setName(res.player_name || ''); setFolder(res.replays_folder || '')
      onSaved?.()
      if (payload.player_name) {
        // Cambiar de jugador re-etiqueta todas las stats → recargar la vista para que
        // todas las pantallas reflejen el cambio al instante (sin reiniciar nada).
        setMsg({ type: 'ok', text: 'Aplicando cambios…' })
        setTimeout(() => window.location.reload(), 600)
      } else {
        setMsg({ type: 'ok', text: 'Ajustes guardados.' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const restartBackend = async () => {
    if (!isElectron) return
    setRestarting(true); setMsg({ type: 'ok', text: 'Reiniciando backend…' })
    try {
      const res = await window.electronAPI.restartBackend()
      if (res?.ok) {
        window.location.reload()
      } else if (res?.reason === 'external') {
        setMsg({ type: 'err', text: 'El backend se lanzó por separado; reinícialo tú manualmente.' })
      } else {
        setMsg({ type: 'err', text: 'No se pudo reiniciar el backend.' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(2,8,18,0.66)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: '#071829', border: '1px solid #1A3A5C' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 sticky top-0"
             style={{ background: '#071829', borderBottom: '1px solid #122A4D' }}>
          <h2 className="font-display font-bold text-white uppercase tracking-wider text-sm flex items-center gap-2">
            <span className="text-rl-blue">
              {/* Mismo icono que el botón del Sidebar (rueda dentada Material) */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.32-.02-.63-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.31-.07.63-.07.94 0 .31.02.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.31.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.06.24.25.41.49.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/>
              </svg>
            </span>
            Ajustes
          </h2>
          <button onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-lg leading-none px-1"
            title="Cerrar (Esc)">×</button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-gray-500 text-sm py-6 text-center">Cargando ajustes…</p>
          ) : (
            <>
              <Section title="Perfil"
                       desc="Tus estadísticas y tu perfil se calculan para este jugador. Al cambiarlo se recalcula sobre las partidas existentes.">
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
              </Section>

              <Section title="Replays"
                       desc={isElectron
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
              </Section>

              <Section title="Rendimiento"
                       desc="Las stats de posición y posesión se calculan de los replays (proceso pesado).">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={data?.advanced_background ?? true}
                         onChange={e => toggleBackground(e.target.checked)}
                         className="accent-rl-blue w-4 h-4" />
                  <span className="text-sm text-gray-300">Calcular stats avanzadas en segundo plano</span>
                </label>
                {status && status.total > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                      <span>{status.computed} de {status.total} partidas calculadas</span>
                      <span className="font-mono-num">{Math.round(status.computed / status.total * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#0D2240' }}>
                      <div className="h-full rounded-full"
                           style={{ width: `${status.computed / status.total * 100}%`, background: '#00A8FF' }} />
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Notificaciones" desc="Avisos del sistema sobre el procesado de replays. Actívalos por separado.">
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data?.notify_match_added ?? true}
                           onChange={e => toggleNotify('notify_match_added', e.target.checked)}
                           className="accent-rl-blue w-4 h-4" />
                    <span className="text-sm text-gray-300">Avisar de nuevas partidas añadidas</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data?.notify_corrupt ?? true}
                           onChange={e => toggleNotify('notify_corrupt', e.target.checked)}
                           className="accent-rl-blue w-4 h-4" />
                    <span className="text-sm text-gray-300">Avisar de partidas corruptas no añadidas</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data?.notify_parse_error ?? true}
                           onChange={e => toggleNotify('notify_parse_error', e.target.checked)}
                           className="accent-rl-blue w-4 h-4" />
                    <span className="text-sm text-gray-300">Avisar de errores al procesar un replay</span>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Las repeticiones sin datos (corruptas, freeplay o de menú) no se guardan en la base de datos.
                  Los errores son replays que no se pudieron leer.
                </p>
              </Section>

              <Section title="Avanzado" desc="Estos valores solo cambian editando la configuración y reiniciando el backend.">
                <div className="text-xs text-gray-500 space-y-1 font-mono-num">
                  <p>Puerto backend: <span className="text-gray-300">{data?.backend_port}</span></p>
                  <p>Base de datos: <span className="text-gray-300 break-all">{data?.db_path}</span></p>
                  <p>Zona horaria: <span className="text-gray-300">{data?.timezone}</span></p>
                </div>
                {isElectron && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid #122A4D' }}>
                    <button onClick={restartBackend} disabled={restarting}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-all disabled:opacity-50"
                      style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
                      {restarting ? 'Reiniciando…' : '↻ Reiniciar backend'}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      Reinicia el backend en segundo plano sin cerrar la app. Útil si algo se queda colgado.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Pie */}
        {!loading && (
          <div className="flex items-center justify-end gap-3 px-5 py-3.5 sticky bottom-0"
               style={{ background: '#071829', borderTop: '1px solid #122A4D' }}>
            {msg && (
              <span className="text-sm mr-auto" style={{ color: msg.type === 'ok' ? '#3DDB85' : '#FF4757' }}>
                {msg.text}
              </span>
            )}
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white transition-all"
              style={{ background: '#0D2240', border: '1px solid #1A3A5C' }}>
              Cerrar
            </button>
            <button onClick={save} disabled={!dirty || saving}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(0,168,255,0.15)', border: '1px solid rgba(0,168,255,0.45)', color: '#fff' }}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
