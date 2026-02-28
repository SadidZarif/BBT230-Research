import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DailyRow, ShoutLevel } from '../types'
import { round2 } from '../scoring'

function fmtLongDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d)
}

function shoutLabel(level: ShoutLevel) {
  switch (level) {
    case 'Low':
      return 'Low Level'
    case 'Minimal':
      return 'Minimal Level'
    case 'Moderate':
      return 'Moderate Intensity'
    case 'High':
      return 'High Level'
    case 'Extreme':
      return 'Extreme Level'
  }
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function WellBeingModal({
  open,
  row,
  onClose,
}: {
  open: boolean
  row: DailyRow | null
  onClose: () => void
}) {
  const modalRef = useRef<HTMLDivElement | null>(null)

  return (
    <AnimatePresence>
      {open && row ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className="modal-glass w-full max-w-4xl rounded-3xl relative overflow-hidden flex flex-col md:flex-row shadow-modal border border-primary/30"
            ref={modalRef}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            role="dialog"
            aria-modal="true"
            aria-label="Daily Well-Being Report"
          >
            <div className="absolute inset-0 rounded-3xl pointer-events-none z-0 shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]" />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 text-slate-400 hover:text-white transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded-full p-2 backdrop-blur-md border border-white/10"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            {/* Left score panel */}
            <div className="w-full md:w-1/3 bg-gradient-to-b from-primary/10 to-transparent p-8 flex flex-col items-center justify-center border-r border-white/5 relative">
              <div className="absolute top-6 left-6 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-600/50 text-xs font-bold text-slate-300 backdrop-blur-md shadow-lg">
                {fmtLongDate(row.dateISO)}
              </div>

              <div className="relative w-48 h-48 flex items-center justify-center mb-6 floating-score perspective-[1000px]">
                <div className="absolute inset-0 rounded-full border-[6px] border-primary/20 transform rotate-x-12 shadow-[0_0_30px_rgba(99,102,241,0.2)]" />
                <div className="absolute inset-2 rounded-full border-[2px] border-accent/20 transform -rotate-x-12" />

                <div className="w-36 h-36 rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.5),inset_10px_10px_20px_rgba(255,255,255,0.4),0_0_50px_rgba(99,102,241,0.6)] flex items-center justify-center relative z-10 border border-white/20">
                  <div className="text-center">
                    <span className="block text-5xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                      {round2(row.wellBeingScore).toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-indigo-100 uppercase tracking-widest mt-1">
                      Score / 5
                    </span>
                  </div>
                  <div className="absolute top-4 left-6 w-12 h-6 bg-white/20 rounded-full blur-[8px] transform -rotate-45" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white text-center mb-1">Daily Well-Being</h2>
              <p className="text-slate-400 text-sm text-center mb-6">Report &amp; Analysis</p>

              <div className="relative group cursor-default w-full max-w-[280px]">
                <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg blur opacity-40 group-hover:opacity-75 transition duration-1000 group-hover:duration-200" />
                <div className="relative px-6 py-3 bg-slate-900 ring-1 ring-gray-900/5 rounded-lg leading-none flex items-center space-x-3 shadow-3d transform transition-transform group-hover:scale-[1.02]">
                  <span className="material-symbols-outlined text-pink-500">campaign</span>
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-400 font-semibold uppercase">Shout Level</p>
                    <p className="text-white font-bold text-base">{shoutLabel(row.shoutLevel)}</p>
                  </div>
                </div>
              </div>

              {/* Well-being bar (requested) */}
              <div className="w-full max-w-[280px] mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
                    Well-Being Bar
                  </span>
                  <span className="text-xs font-mono text-accent">
                    {(row.wellBeingScore / 5).toFixed(2)}
                  </span>
                </div>
                <div className="glass-card rounded-xl p-3 border border-white/5">
                  <div className="h-3 rounded-full bg-slate-800/70 overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-secondary to-accent shadow-neon"
                      style={{ width: `${clampPct((row.wellBeingScore / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right breakdown panel */}
            <div className="w-full md:w-2/3 p-8 flex flex-col relative">
              <div
                className="absolute inset-0 z-0 opacity-5 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />

              <div className="flex justify-between items-end mb-10 z-10 relative">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-6 bg-accent rounded-sm shadow-neon-accent" />
                    Variable Breakdown
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 ml-4">
                    Correlated impact factors for the selected day.
                  </p>
                </div>
              </div>

              <div className="flex-1 flex items-end justify-between px-4 pb-8 perspective-[1000px] gap-4 z-10 relative h-[300px]">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12 opacity-20">
                  <div className="w-full h-px bg-slate-400 border-dashed border-b border-slate-400" />
                  <div className="w-full h-px bg-slate-400 border-dashed border-b border-slate-400" />
                  <div className="w-full h-px bg-slate-400 border-dashed border-b border-slate-400" />
                  <div className="w-full h-px bg-slate-400 border-dashed border-b border-slate-400" />
                  <div className="w-full h-px bg-slate-400" />
                </div>

                <MetricBar
                  icon="bedtime"
                  label="Sleep"
                  valueLabel={`${(row.sleepHours ?? 0).toFixed(1)} Hours`}
                  heightPct={clampPct(((row.sleepHours ?? 0) / 10) * 100)}
                  colorFrom="from-blue-900"
                  colorTo="to-blue-500"
                  glow="shadow-[0_0_25px_rgba(59,130,246,0.3)]"
                  iconColor="text-blue-400"
                />

                <MetricBar
                  icon="menu_book"
                  label="Study"
                  valueLabel={`${Math.round(row.studyMinutes ?? 0)} Mins`}
                  heightPct={clampPct(((row.studyMinutes ?? 0) / 270) * 100)}
                  colorFrom="from-purple-900"
                  colorTo="to-purple-500"
                  glow="shadow-[0_0_25px_rgba(168,85,247,0.3)]"
                  iconColor="text-purple-400"
                />

                <MetricBar
                  icon="warning"
                  label="Stress"
                  valueLabel={`(${row.stress ?? 0}/10)`}
                  heightPct={clampPct(((row.stress ?? 0) / 10) * 100)}
                  colorFrom="from-orange-900"
                  colorTo="to-orange-500"
                  glow="shadow-[0_0_25px_rgba(249,115,22,0.3)]"
                  iconColor="text-orange-400"
                />

                <MetricBar
                  icon="nutrition"
                  label="Food"
                  valueLabel={`(${row.food ?? 0}/10)`}
                  heightPct={clampPct(((row.food ?? 0) / 10) * 100)}
                  colorFrom="from-emerald-900"
                  colorTo="to-emerald-500"
                  glow="shadow-[0_0_25px_rgba(16,185,129,0.3)]"
                  iconColor="text-emerald-400"
                />

                <MetricBar
                  icon="groups"
                  label="Social"
                  valueLabel={`(${row.social ?? 0}/10)`}
                  heightPct={clampPct(((row.social ?? 0) / 10) * 100)}
                  colorFrom="from-pink-900"
                  colorTo="to-pink-500"
                  glow="shadow-[0_0_25px_rgba(236,72,153,0.3)]"
                  iconColor="text-pink-400"
                />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/50 flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium italic">
                  Data generated from research study #4021
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                  <span className="text-xs text-slate-300 font-semibold uppercase tracking-wide">
                    Sync Complete
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function MetricBar({
  icon,
  label,
  valueLabel,
  heightPct,
  colorFrom,
  colorTo,
  glow,
  iconColor,
}: {
  icon: string
  label: string
  valueLabel: string
  heightPct: number
  colorFrom: string
  colorTo: string
  glow: string
  iconColor: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 w-full h-full justify-end group">
      <div className="relative w-14 flex-1 flex items-end justify-center perspective-[800px] group-hover:-translate-y-2 transition-transform duration-500">
        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded border border-slate-600 shadow-lg mb-2 z-20 pointer-events-none whitespace-nowrap">
          {valueLabel}
        </div>
        <div
          className={`w-10 bg-gradient-to-t ${colorFrom} ${colorTo} rounded-t-sm bar-3d ${glow}`}
          style={{ height: `${heightPct}%` }}
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0wIDBoNHY0SDB6IiBmaWxsPSJyZ2JhKDI1NSwgMjU1LDI1NSwgMC4wNSkiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')] opacity-30" />
        </div>
      </div>
      <div className="text-center z-20">
        <div className="w-8 h-8 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700 mb-2 mx-auto shadow-lg">
          <span className={`material-symbols-outlined ${iconColor} text-sm`}>{icon}</span>
        </div>
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

