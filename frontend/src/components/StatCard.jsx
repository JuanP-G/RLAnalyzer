export default function StatCard({ label, value, sub, color = 'text-rl-blue', large = false, accentColor = null }) {
  const accent = accentColor || '#00A8FF'
  return (
    <div
      className="relative bg-bg-secondary rounded-xl p-4 flex flex-col gap-1 overflow-hidden transition-all duration-200 hover:translate-y-[-1px]"
      style={{ border: '1px solid #122A4D', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
    >
      {/* Línea de acento superior */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}99, transparent)` }}
      />
      <p className="text-gray-500 text-[11px] uppercase tracking-wider font-display font-semibold">
        {label}
      </p>
      <p className={`font-mono-num font-bold leading-none ${large ? 'text-3xl mt-1' : 'text-2xl mt-0.5'} ${color}`}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-gray-600 text-[11px] mt-0.5">{sub}</p>}
    </div>
  )
}
