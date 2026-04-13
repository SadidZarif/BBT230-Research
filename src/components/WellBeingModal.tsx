import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DailyRow, ShoutLevel, DailyRecord } from '../types'
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

function buildInsightsText(row: DailyRow): string {
  const weakAreas: string[] = []
  if ((row.stressScore ?? 0) <= 0.4) weakAreas.push('high stress levels')
  if ((row.sleepScore ?? 0) <= 0.4) weakAreas.push('insufficient sleep')
  if ((row.studyScore ?? 0) <= 0.4) weakAreas.push('low study time')
  if ((row.foodScore ?? 0) <= 0.4) weakAreas.push('poor food consumption')
  if ((row.socialScore ?? 0) <= 0.4) weakAreas.push('limited social interaction')

  if (weakAreas.length === 0) {
    return 'Your well-being score is below average today. While no single variable is extremely low, the combined effect across multiple lifestyle factors has reduced your overall score.'
  }
  if (weakAreas.length === 1) {
    return `Your well-being score is critical today primarily due to ${weakAreas[0]}. This single factor is significantly dragging down your overall vitality.`
  }
  const last = weakAreas.pop()!
  return `Your well-being score is critical today primarily due to ${weakAreas.join(', ')} and ${last}. These factors are collectively reducing your overall well-being.`
}

const LOW_SCORE_THRESHOLD = 3

export function WellBeingModal({
  open,
  row,
  onClose,
  onUpdate,
  theme: _theme,
}: {
  open: boolean
  row: DailyRow | null
  onClose: () => void
  onUpdate?: (dayNumber: number, patch: Partial<DailyRecord>) => void
  theme?: 'light' | 'dark'
}) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const isLowScore = row ? row.wellBeingScore <= LOW_SCORE_THRESHOLD : false

  const [notes, setNotes] = useState('')
  const saveTimer = useRef<number | null>(null)
  const hydratedDayRef = useRef<number | null>(null)
  const savedNotes = row?.lowScoreNotes ?? ''
  const hasUnsavedNotes = notes !== savedNotes

  const [frozenSize, setFrozenSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (open) {
      setFrozenSize({ w: window.innerWidth, h: window.innerHeight })
    } else {
      setFrozenSize(null)
    }
  }, [open])

  useEffect(() => {
    if (open && row && hydratedDayRef.current !== row.dayNumber) {
      setNotes(row.lowScoreNotes ?? '')
      hydratedDayRef.current = row.dayNumber
    }
    if (!open) {
      hydratedDayRef.current = null
    }
  }, [open, row?.dayNumber])

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    }
  }, [])

  function handleNotesChange(value: string) {
    setNotes(value)
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (row && onUpdate) {
        onUpdate(row.dayNumber, { lowScoreNotes: value })
      }
    }, 800)
  }

  function flushNotesSave() {
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    if (row && onUpdate) {
      onUpdate(row.dayNumber, { lowScoreNotes: notes })
    }
  }

  return (
    <AnimatePresence>
      {open && row ? (
        <motion.div
          ref={overlayRef}
          className="fixed z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          style={{
            top: 0,
            left: 0,
            width: frozenSize ? `${frozenSize.w}px` : '100vw',
            height: frozenSize ? `${frozenSize.h}px` : '100vh',
            overflow: 'hidden',
            padding: '0.75rem',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className={`modal-glass w-full rounded-3xl relative shadow-modal overflow-hidden ${
              isLowScore
                ? 'lg:max-w-5xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.3),inset_0_0_15px_rgba(239,68,68,0.1)]'
                : 'lg:max-w-4xl border border-primary/30'
            }`}
            style={{
              maxWidth: frozenSize ? `${Math.min(frozenSize.w - 24, frozenSize.w * 0.95)}px` : '95vw',
              maxHeight: frozenSize ? `${frozenSize.h - 24}px` : 'calc(100vh - 1.5rem)',
            }}
            ref={modalRef}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            role="dialog"
            aria-modal="true"
            aria-label="Daily Well-Being Report"
          >
            <div
              className={`absolute inset-0 rounded-3xl pointer-events-none z-0 ${
                isLowScore
                  ? 'shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]'
                  : 'shadow-[inset_0_0_20px_rgba(99,102,241,0.2)]'
              }`}
            />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700/50 rounded-full p-2 backdrop-blur-md border border-slate-200 dark:border-white/10"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div
              className="relative z-10 w-full overflow-y-auto overscroll-contain flex flex-col md:flex-row"
              style={{ maxHeight: frozenSize ? `${frozenSize.h - 24}px` : 'calc(100vh - 1.5rem)' }}
            >
              {/* Left score panel */}
              <div
                className={`w-full md:w-1/3 p-6 sm:p-8 flex flex-col items-center justify-start md:justify-center border-b md:border-b-0 md:border-r border-slate-200/50 dark:border-white/5 relative ${
                  isLowScore ? 'bg-gradient-to-b from-red-500/10 to-transparent' : 'bg-gradient-to-b from-primary/10 to-transparent'
                }`}
              >
                <div className="absolute top-6 left-6 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/50 text-xs font-bold text-slate-600 dark:text-slate-300 backdrop-blur-md shadow-lg">
                  {fmtLongDate(row.dateISO)}
                </div>

                <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center mb-6 floating-score perspective-[1000px] mt-10 md:mt-0">
                  <div
                    className={`absolute inset-0 rounded-full border-[6px] transform rotate-x-12 ${
                      isLowScore
                        ? 'border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                        : 'border-primary/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                    }`}
                  />
                  <div
                    className={`absolute inset-2 rounded-full border-[2px] transform -rotate-x-12 ${
                      isLowScore ? 'border-orange-500/20' : 'border-accent/20'
                    }`}
                  />

                  <div
                    className={`w-32 h-32 sm:w-36 sm:h-36 rounded-full flex items-center justify-center relative z-10 border border-white/20 ${
                      isLowScore
                        ? 'bg-gradient-to-br from-red-600 to-rose-900 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.5),inset_10px_10px_20px_rgba(255,255,255,0.4),0_0_50px_rgba(239,68,68,0.6)]'
                        : 'bg-gradient-to-br from-indigo-500 to-purple-700 shadow-[inset_-10px_-10px_20px_rgba(0,0,0,0.5),inset_10px_10px_20px_rgba(255,255,255,0.4),0_0_50px_rgba(99,102,241,0.6)]'
                    }`}
                  >
                    <div className="text-center">
                      <span className="block text-4xl sm:text-5xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                        {round2(row.wellBeingScore).toFixed(2)}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase tracking-widest mt-1 ${
                          isLowScore ? 'text-red-100' : 'text-indigo-100'
                        }`}
                      >
                        Score / 5
                      </span>
                    </div>
                    <div className="absolute top-4 left-6 w-12 h-6 bg-white/20 rounded-full blur-[8px] transform -rotate-45" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-1">Daily Well-Being</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">Report &amp; Analysis</p>

                <div className="relative group cursor-default w-full max-w-[280px]">
                  <div
                    className={`absolute -inset-1 rounded-lg blur opacity-40 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 ${
                      isLowScore
                        ? 'bg-gradient-to-r from-red-600 to-orange-600'
                        : 'bg-gradient-to-r from-pink-600 to-purple-600'
                    }`}
                  />
                  <div className="relative px-6 py-3 bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-gray-900/5 rounded-lg leading-none flex items-center space-x-3 shadow-3d transform transition-transform group-hover:scale-[1.02]">
                    <span className={`material-symbols-outlined ${isLowScore ? 'text-red-500' : 'text-pink-500'}`}>
                      {isLowScore ? 'priority_high' : 'campaign'}
                    </span>
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">
                        {isLowScore ? 'Attention Needed' : 'Shout Level'}
                      </p>
                      <p className="text-slate-900 dark:text-white font-bold text-base">
                        {isLowScore ? 'Critical Level' : shoutLabel(row.shoutLevel)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Well-being bar */}
                <div className="w-full max-w-[280px] mt-6 pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Well-Being Bar
                    </span>
                    <span className={`text-xs font-mono ${isLowScore ? 'text-red-500 dark:text-red-400' : 'text-accent'}`}>
                      {(row.wellBeingScore / 5).toFixed(2)}
                    </span>
                  </div>
                  <div className="glass-card rounded-xl p-3 border border-slate-200/50 dark:border-white/5">
                    <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800/70 overflow-hidden border border-slate-300/50 dark:border-white/5">
                      <div
                        className={`h-full rounded-full ${
                          isLowScore
                            ? 'bg-gradient-to-r from-red-600 via-orange-500 to-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                            : 'bg-gradient-to-r from-primary via-secondary to-accent shadow-neon'
                        }`}
                        style={{ width: `${clampPct((row.wellBeingScore / 5) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right breakdown panel */}
              <div className="w-full md:w-2/3 p-6 sm:p-8 flex flex-col relative min-h-0">
                <div
                  className="absolute inset-0 z-0 opacity-5 pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />

                {isLowScore ? (
                  <>
                    <div className="flex justify-between items-end mb-5 z-10 relative">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="w-2 h-6 rounded-sm bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                          Variable Breakdown
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 ml-4">
                          Impact factors for today's low well-being score.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 z-10 relative lg:flex-1 lg:min-h-0 lg:overflow-hidden">
                      {/* Left column: insights + notes */}
                      <div className="w-full lg:w-[55%] flex flex-col min-w-0 order-2 lg:order-1">
                        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-1">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="material-symbols-outlined text-red-500">psychology_alt</span>
                            <h4 className="text-lg font-bold text-slate-900 dark:text-white">Low Well-Being Insights</h4>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-5">{buildInsightsText(row)}</p>
                          <div className="space-y-3 lg:mt-auto">
                            <label
                              className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1"
                              htmlFor={`notes-${row.dayNumber}`}
                            >
                              Other Potential Factors
                            </label>
                            <div className="relative">
                              <textarea
                                id={`notes-${row.dayNumber}`}
                                className="relative w-full bg-slate-100 dark:bg-slate-900/80 border border-slate-300 dark:border-white/10 rounded-xl p-4 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 outline-none focus:border-red-500/40 shadow-inner-3d h-[96px] resize-none box-border"
                                placeholder="E.g. Work deadline, physical illness, environment changes..."
                                value={notes}
                                onChange={(e) => handleNotesChange(e.target.value)}
                                onBlur={flushNotesSave}
                              />
                            </div>
                            <div className="flex min-h-[34px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <span className="pr-2 text-[11px] text-slate-500">
                                Notes auto-save while you type.
                              </span>
                              <span
                                className={`inline-flex min-w-[92px] justify-center items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${
                                  hasUnsavedNotes
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-400/20'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-400/20'
                                }`}
                              >
                                {hasUnsavedNotes ? (
                                  <>
                                    <span className="material-symbols-outlined mr-1 animate-spin text-[13px]">progress_activity</span>
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <span className="material-symbols-outlined mr-1 text-[13px]">check_circle</span>
                                    Saved
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right column: 5 bars */}
                      <div className="w-full lg:w-[45%] shrink-0 order-1 lg:order-2 min-w-0">
                        <div className="flex items-end justify-between px-3 sm:px-4 pb-6 perspective-[1000px] gap-3 sm:gap-4 relative h-[220px] sm:h-[250px] lg:h-full">
                          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-10 opacity-20">
                            <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                            <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                            <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                            <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                            <div className="w-full h-px bg-slate-300 dark:bg-slate-400" />
                          </div>

                          <MetricBar
                            icon="bedtime"
                            label="Sleep"
                            valueLabel={`${(row.sleepHours ?? 0).toFixed(1)} Hrs`}
                            heightPct={clampPct(((row.sleepHours ?? 0) / 10) * 100)}
                            colorFrom={row.sleepScore <= 0.4 ? 'from-red-900' : 'from-blue-900'}
                            colorTo={row.sleepScore <= 0.4 ? 'to-red-500' : 'to-blue-500'}
                            glow={row.sleepScore <= 0.4 ? 'shadow-[0_0_25px_rgba(239,68,68,0.3)]' : 'shadow-[0_0_25px_rgba(59,130,246,0.3)]'}
                            iconColor={row.sleepScore <= 0.4 ? 'text-red-400' : 'text-blue-400'}
                          />
                          <MetricBar
                            icon="menu_book"
                            label="Study"
                            valueLabel={`${Math.round(row.studyMinutes ?? 0)} Min`}
                            heightPct={clampPct(((row.studyMinutes ?? 0) / 270) * 100)}
                            colorFrom={row.studyScore <= 0.4 ? 'from-red-900' : 'from-purple-900'}
                            colorTo={row.studyScore <= 0.4 ? 'to-orange-500' : 'to-purple-500'}
                            glow={row.studyScore <= 0.4 ? 'shadow-[0_0_25px_rgba(249,115,22,0.3)]' : 'shadow-[0_0_25px_rgba(168,85,247,0.3)]'}
                            iconColor={row.studyScore <= 0.4 ? 'text-orange-400' : 'text-purple-400'}
                          />
                          <MetricBar
                            icon="warning"
                            label="Stress"
                            valueLabel={`${row.stress ?? 0}/10`}
                            heightPct={clampPct(((row.stress ?? 0) / 10) * 100)}
                            colorFrom={row.stressScore <= 0.4 ? 'from-red-900' : 'from-orange-900'}
                            colorTo={row.stressScore <= 0.4 ? 'to-rose-500' : 'to-orange-500'}
                            glow={row.stressScore <= 0.4 ? 'shadow-[0_0_25px_rgba(244,63,94,0.3)]' : 'shadow-[0_0_25px_rgba(249,115,22,0.3)]'}
                            iconColor={row.stressScore <= 0.4 ? 'text-rose-400' : 'text-orange-400'}
                          />
                          <MetricBar
                            icon="nutrition"
                            label="Food"
                            valueLabel={`${row.food ?? 0}/10`}
                            heightPct={clampPct(((row.food ?? 0) / 10) * 100)}
                            colorFrom={row.foodScore <= 0.4 ? 'from-red-900' : 'from-emerald-900'}
                            colorTo={row.foodScore <= 0.4 ? 'to-red-400' : 'to-emerald-500'}
                            glow={row.foodScore <= 0.4 ? 'shadow-[0_0_25px_rgba(239,68,68,0.3)]' : 'shadow-[0_0_25px_rgba(16,185,129,0.3)]'}
                            iconColor={row.foodScore <= 0.4 ? 'text-red-300' : 'text-emerald-400'}
                          />
                          <MetricBar
                            icon="groups"
                            label="Social"
                            valueLabel={`${row.social ?? 0}/10`}
                            heightPct={clampPct(((row.social ?? 0) / 10) * 100)}
                            colorFrom={row.socialScore <= 0.4 ? 'from-red-950' : 'from-pink-900'}
                            colorTo={row.socialScore <= 0.4 ? 'to-red-600' : 'to-pink-500'}
                            glow={row.socialScore <= 0.4 ? 'shadow-[0_0_25px_rgba(220,38,38,0.3)]' : 'shadow-[0_0_25px_rgba(236,72,153,0.3)]'}
                            iconColor={row.socialScore <= 0.4 ? 'text-red-500' : 'text-pink-400'}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-end mb-6 sm:mb-10 z-10 relative">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="w-2 h-6 rounded-sm bg-accent shadow-neon-accent" />
                          Variable Breakdown
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 ml-4">
                          Correlated impact factors for the selected day.
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 flex items-end justify-between px-2 sm:px-4 pb-6 sm:pb-8 perspective-[1000px] gap-3 sm:gap-4 z-10 relative h-[220px] sm:h-[260px] md:h-[300px]">
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-10 opacity-20">
                        <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                        <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                        <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                        <div className="w-full h-px bg-slate-300 dark:bg-slate-400 border-dashed border-b border-slate-300 dark:border-slate-400" />
                        <div className="w-full h-px bg-slate-300 dark:bg-slate-400" />
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
                  </>
                )}

                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 flex justify-between items-center z-10">
                  <span className="text-xs text-slate-500 font-medium italic">
                    Data generated from research study #4021
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full animate-pulse ${
                        isLowScore
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                          : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                      }`}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wide">
                      {isLowScore ? 'Analysis Ready' : 'Sync Complete'}
                    </span>
                  </div>
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
    <div className="flex-1 min-w-0 flex flex-col items-center gap-3 sm:gap-4 h-full justify-end group">
      <div className="relative w-10 sm:w-12 flex-1 flex items-end justify-center perspective-[800px] group-hover:-translate-y-2 transition-transform duration-500">
        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs py-1 px-2 rounded border border-slate-200 dark:border-slate-600 shadow-lg mb-2 z-20 pointer-events-none whitespace-nowrap">
          {valueLabel}
        </div>
        <div
          className={`w-7 sm:w-8 bg-gradient-to-t ${colorFrom} ${colorTo} rounded-t-sm bar-3d ${glow}`}
          style={{ height: `${heightPct}%` }}
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0wIDBoNHY0SDB6IiBmaWxsPSJyZ2JhKDI1NSwgMjU1LDI1NSwgMC4wNSkiIGZpbGwtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==')] opacity-30" />
        </div>
      </div>
      <div className="text-center z-20 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/50 dark:bg-slate-800/50 flex items-center justify-center border border-slate-200 dark:border-slate-700 mb-2 mx-auto shadow-lg">
          <span className={`material-symbols-outlined ${iconColor} text-[12px] sm:text-sm`}>{icon}</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide">{label}</p>
      </div>
    </div>
  )
}
