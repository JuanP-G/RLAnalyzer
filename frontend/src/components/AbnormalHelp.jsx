import { useState } from 'react'

/**
 * Icono de ayuda "?" que explica qué es una partida anómala.
 * Al pasar el ratón por encima despliega un tooltip con los umbrales actuales.
 *
 * Props:
 *   minDuration   umbral de duración mínima en segundos (default 180)
 *   maxGoalDiff   diferencia de goles que se considera paliza (default 5)
 */
export default function AbnormalHelp({ minDuration = 180, maxGoalDiff = 5 }) {
  const [open, setOpen] = useState(false)
  const mins = Math.round(minDuration / 60)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help select-none"
        style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.4)' }}
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 top-full right-0 mt-2 w-64 p-3 rounded-lg text-[11px] leading-relaxed text-gray-300 shadow-xl"
          style={{ background: '#071829', border: '1px solid #1A3A5C' }}
        >
          <span className="block font-semibold text-gray-100 mb-1">¿Qué es una partida anómala?</span>
          Una partida se considera anómala si:
          <span className="block mt-1">
            • Dura menos de <b className="text-amber-300">{mins} min</b> ({minDuration}s) — probable rendición o partida incompleta.
          </span>
          <span className="block mt-0.5">
            • Se gana o pierde por <b className="text-amber-300">{maxGoalDiff}+ goles</b> de diferencia — paliza.
          </span>
          <span className="block mt-1.5 text-gray-500">
            Se excluyen de las medias para no distorsionarlas, pero <b className="text-gray-400">sí cuentan para el win rate</b>.
          </span>
        </span>
      )}
    </span>
  )
}
