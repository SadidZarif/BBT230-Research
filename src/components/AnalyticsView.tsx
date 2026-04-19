import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import type { DailyRow } from '../types'
import { pearsonCorrelation, linearRegression } from '../analytics'
import { computeLifestylePca } from '../pca'
import { round2 } from '../scoring'
import { subscribeAnalysisNotes, updateAnalysisNote } from '../analysisNotes.ts'

type PairMetricKey = 'stress' | 'sleepHours' | 'studyMinutes' | 'food' | 'social'

type PairMetricConfig = {
  key: PairMetricKey
  label: string
  shortLabel: string
  color: string
  min: number
  max?: number
}

type PairScatterPoint = {
  value: [number, number, number]
  rawValue: [number, number]
  dateLabel: string
  shoutCount: number
  group: string
}

type InsightStat = {
  label: string
  value: string
}

type ChartInsight = {
  id: string
  title: string
  subtitle: string
  option: Record<string, unknown>
  summary: string
  bullets: string[]
  stats: InsightStat[]
  accentClass: string
}

const PAIR_METRICS: PairMetricConfig[] = [
  { key: 'stress', label: 'Stress', shortLabel: 'Stress', color: '#f97316', min: 1, max: 10 },
  { key: 'sleepHours', label: 'Sleep Hours', shortLabel: 'Sleep', color: '#3b82f6', min: 0, max: 8 },
  { key: 'studyMinutes', label: 'Study Minutes', shortLabel: 'Study', color: '#a855f7', min: 0 },
  { key: 'food', label: 'Food Score', shortLabel: 'Food', color: '#10b981', min: 1, max: 10 },
  { key: 'social', label: 'Social Interaction', shortLabel: 'Social', color: '#ec4899', min: 1, max: 10 },
]

function fmtShort(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function shoutGroupLabel(shoutCount: number) {
  if (shoutCount <= 3) return 'Low shout'
  if (shoutCount <= 6) return 'Moderate shout'
  return 'High shout'
}

function metricValue(row: DailyRow, key: PairMetricKey) {
  return row[key] as number
}

function metricMax(rows: DailyRow[], key: PairMetricKey, fallbackMin: number) {
  const values = rows.map((row) => metricValue(row, key))
  const maxValue = values.length > 0 ? Math.max(...values) : fallbackMin
  if (key === 'studyMinutes') {
    return Math.max(180, Math.ceil(maxValue / 30) * 30)
  }
  return maxValue
}

function buildMetricPairs(metrics: PairMetricConfig[]) {
  const pairs: Array<{ x: PairMetricConfig; y: PairMetricConfig }> = []
  for (let i = 0; i < metrics.length; i++) {
    for (let j = i + 1; j < metrics.length; j++) {
      pairs.push({ x: metrics[i]!, y: metrics[j]! })
    }
  }
  return pairs
}

function spreadOverlappingPairPoints({
  rows,
  x,
  y,
  xMin,
  xMax,
  yMin,
  yMax,
}: {
  rows: DailyRow[]
  x: PairMetricConfig
  y: PairMetricConfig
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}) {
  const grouped = new Map<string, PairScatterPoint[]>()

  for (const row of rows) {
    const rawX = metricValue(row, x.key)
    const rawY = metricValue(row, y.key)
    const key = `${rawX}__${rawY}`
    const point: PairScatterPoint = {
      value: [rawX, rawY, row.dayNumber],
      rawValue: [rawX, rawY],
      dateLabel: fmtShort(row.dateISO),
      shoutCount: row.shoutCount as number,
      group: shoutGroupLabel(row.shoutCount as number),
    }
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(point)
    } else {
      grouped.set(key, [point])
    }
  }

  const out: PairScatterPoint[] = []
  const xRadius = Math.max((xMax - xMin) * 0.02, 0.12)
  const yRadius = Math.max((yMax - yMin) * 0.02, 0.12)

  for (const bucket of grouped.values()) {
    if (bucket.length === 1) {
      out.push(bucket[0]!)
      continue
    }

    const ordered = [...bucket].sort((a, b) => a.value[2] - b.value[2])
    ordered.forEach((point, index) => {
      const angle = (2 * Math.PI * index) / ordered.length
      const displayX = clamp(point.rawValue[0] + Math.cos(angle) * xRadius, xMin, xMax)
      const displayY = clamp(point.rawValue[1] + Math.sin(angle) * yRadius, yMin, yMax)
      out.push({
        ...point,
        value: [displayX, displayY, point.value[2]],
      })
    })
  }

  return out
}

function meanValue(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((sum, x) => sum + x, 0) / xs.length
}

function sampleStd(xs: number[]) {
  if (xs.length < 2) return 0
  const mean = meanValue(xs)
  let total = 0
  for (const x of xs) total += (x - mean) ** 2
  return Math.sqrt(total / (xs.length - 1))
}

function minValue(xs: number[]) {
  return xs.length > 0 ? Math.min(...xs) : 0
}

function maxValue(xs: number[]) {
  return xs.length > 0 ? Math.max(...xs) : 0
}

function consecutiveDiffs(xs: number[]) {
  const out: number[] = []
  for (let i = 1; i < xs.length; i++) {
    out.push(xs[i]! - xs[i - 1]!)
  }
  return out
}

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--'
}

function formatSigned(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

function correlationStrength(r: number) {
  const abs = Math.abs(r)
  if (abs < 0.15) return 'very weak'
  if (abs < 0.35) return 'weak'
  if (abs < 0.6) return 'moderate'
  return 'strong'
}

function correlationDirection(r: number) {
  if (Math.abs(r) < 0.1) return 'no clear linear'
  return r > 0 ? 'positive' : 'negative'
}

function trendDescription(slope: number) {
  if (Math.abs(slope) < 0.02) return 'mostly fluctuating rather than steadily moving in one direction'
  return slope > 0 ? 'showing a gentle upward trend' : 'showing a gentle downward trend'
}

function scoreBandLabel(value: number) {
  if (value <= 3) return 'low-score'
  if (value >= 4) return 'high-score'
  return 'mid-range'
}

function pcaVariableLabel(name: string) {
  switch (name) {
    case 'stress':
      return 'stress'
    case 'sleep':
      return 'sleep'
    case 'study':
      return 'study time'
    case 'food':
      return 'food'
    case 'social':
      return 'social interaction'
    default:
      return name
  }
}

function dominantLoading(
  loadings: Array<{ variable: string; pc1: number; pc2: number; pc3: number }>,
  component: 'pc1' | 'pc2' | 'pc3',
) {
  if (loadings.length === 0) return null
  return [...loadings].sort((a, b) => Math.abs(b[component]) - Math.abs(a[component]))[0] ?? null
}

function strongestSignedLoading(
  loadings: Array<{ variable: string; pc1: number; pc2: number; pc3: number }>,
  component: 'pc1' | 'pc2' | 'pc3',
  direction: 'positive' | 'negative',
) {
  const filtered = loadings.filter((item) =>
    direction === 'positive' ? item[component] > 0 : item[component] < 0,
  )
  if (filtered.length === 0) return null
  return [...filtered].sort((a, b) =>
    direction === 'positive' ? b[component] - a[component] : a[component] - b[component],
  )[0] ?? null
}

function groupMean(rows: Array<{ group: string; value: number }>, group: string) {
  const values = rows.filter((row) => row.group === group).map((row) => row.value)
  return meanValue(values)
}

function groupValues(points: PairScatterPoint[], group: string, axis: 'x' | 'y') {
  return points
    .filter((point) => point.group === group)
    .map((point) => (axis === 'x' ? point.rawValue[0] : point.rawValue[1]))
}

function intervalsOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax)
}

function pairGroupOverlap(points: PairScatterPoint[], groupA: string, groupB: string) {
  const ax = groupValues(points, groupA, 'x')
  const ay = groupValues(points, groupA, 'y')
  const bx = groupValues(points, groupB, 'x')
  const by = groupValues(points, groupB, 'y')
  if (ax.length === 0 || ay.length === 0 || bx.length === 0 || by.length === 0) return false
  return (
    intervalsOverlap(minValue(ax), maxValue(ax), minValue(bx), maxValue(bx)) &&
    intervalsOverlap(minValue(ay), maxValue(ay), minValue(by), maxValue(by))
  )
}

const ANALYSIS_NOTES_STORAGE_KEY = 'bbt230.analysis-graph-notes.v1'

function loadAnalysisNotesLocal() {
  try {
    const raw = localStorage.getItem(ANALYSIS_NOTES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

function saveAnalysisNotesLocal(notes: Record<string, string>) {
  try {
    localStorage.setItem(ANALYSIS_NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Ignore local cache failures and rely on in-memory state.
  }
}

function AnalysisButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-3d inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(99,102,241,0.25)]"
    >
      <span className="material-symbols-outlined text-[14px]">analytics</span>
      Statistical Analysis
    </button>
  )
}

function ChartCard({
  title,
  description,
  onOpenAnalysis,
  children,
  className = '',
}: {
  title: string
  description?: string
  onOpenAnalysis: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0 ${className}`}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-slate-900 dark:text-white font-bold mb-1">{title}</h3>
          {description ? <p className="text-slate-500 dark:text-slate-400 text-xs">{description}</p> : null}
        </div>
        <div className="shrink-0 self-start sm:self-auto">
          <AnalysisButton onClick={onOpenAnalysis} />
        </div>
      </div>
      {children}
    </div>
  )
}

function AnalyticsInsightModal({
  insight,
  open,
  onClose,
  isMobile,
  editableNote,
  savedNote,
  isSavingNote,
  onSaveNote,
}: {
  insight: ChartInsight | null
  open: boolean
  onClose: () => void
  isMobile: boolean
  editableNote: boolean
  savedNote: string
  isSavingNote: boolean
  onSaveNote: (chartId: string, note: string) => void
}) {
  const [noteText, setNoteText] = useState('')
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open && insight?.id && editableNote) {
      setNoteText(savedNote)
    }
    if (!open || !editableNote) {
      setNoteText('')
    }
  }, [open, insight?.id, editableNote, savedNote])

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const hasUnsavedNote = editableNote && noteText !== savedNote

  function queueSave(nextValue: string) {
    if (!editableNote || !insight) return
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      onSaveNote(insight.id, nextValue)
    }, 800)
  }

  function flushNoteSave() {
    if (!editableNote || !insight) return
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    onSaveNote(insight.id, noteText)
  }

  return (
    <AnimatePresence>
      {open && insight ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className="modal-glass relative w-full max-w-7xl overflow-hidden rounded-[28px] border border-slate-200/50 dark:border-white/10 shadow-modal"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 250, damping: 24 }}
            style={{ maxHeight: 'calc(100vh - 1.5rem)' }}
            role="dialog"
            aria-modal="true"
            aria-label={`${insight.title} statistical analysis`}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-30 rounded-full border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-800/60 p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="flex max-h-[calc(100vh-1.5rem)] flex-col xl:flex-row overflow-y-auto">
              <div className="w-full xl:w-[62%] border-b xl:border-b-0 xl:border-r border-slate-200/50 dark:border-white/5 p-4 sm:p-6 lg:p-7">
                <div className="mb-4 flex items-start gap-3 pr-12">
                  <div className={`mt-1 h-10 w-1 rounded-full bg-gradient-to-b ${insight.accentClass}`} />
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{insight.title}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{insight.subtitle}</p>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/50 dark:bg-slate-950/10 p-3 sm:p-4">
                  <ReactECharts style={{ height: isMobile ? 320 : 500 }} option={insight.option} />
                </div>

                {editableNote ? (
                  <div className="mt-4 rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/60 dark:bg-slate-950/15 p-4 sm:p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">sticky_note_2</span>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        Note
                      </h3>
                    </div>
                    <textarea
                      className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/70 p-4 text-sm leading-6 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 outline-none resize-none h-[112px] focus:border-primary/40"
                      placeholder="Write your own note about this graph..."
                      value={noteText}
                      onChange={(e) => {
                        const nextValue = e.target.value
                        setNoteText(nextValue)
                        queueSave(nextValue)
                      }}
                      onBlur={flushNoteSave}
                    />
                    <div className="mt-3 flex min-h-[34px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[11px] text-slate-500">
                        Notes auto-save to your database while you type.
                      </span>
                      <span
                        className={`inline-flex min-w-[92px] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          hasUnsavedNote || isSavingNote
                            ? 'border-amber-400/20 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                            : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                        }`}
                      >
                        {hasUnsavedNote || isSavingNote ? (
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
                ) : null}
              </div>

              <div className="w-full xl:w-[38%] p-4 sm:p-6 lg:p-7">
                <div className="rounded-3xl border border-slate-200/60 dark:border-white/5 bg-white/35 dark:bg-slate-950/10 p-5 sm:p-6">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <span className="material-symbols-outlined text-[14px]">query_stats</span>
                    Statistical Analysis
                  </div>

                  <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">{insight.summary}</p>

                  <div className="mt-5">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Key Reading
                    </h3>
                    <div className="space-y-3">
                      {insight.bullets.map((bullet, index) => (
                        <div
                          key={`${insight.id}-bullet-${index}`}
                          className="rounded-2xl border border-slate-200/70 dark:border-white/5 bg-slate-50/70 dark:bg-slate-900/40 px-4 py-3 text-sm leading-6 text-slate-700 dark:text-slate-300"
                        >
                          {bullet}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Quick Stats
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {insight.stats.map((stat) => (
                        <div
                          key={`${insight.id}-${stat.label}`}
                          className="rounded-2xl border border-slate-200/70 dark:border-white/5 bg-white/70 dark:bg-slate-900/50 px-4 py-3"
                        >
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {stat.label}
                          </div>
                          <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white font-mono">
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-6 text-slate-600 dark:text-slate-400">
                    These comments are generated from the current dataset and chart statistics, so they update as the
                    study data changes.
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

export function AnalyticsView({ rows, theme }: { rows: DailyRow[]; theme: 'light' | 'dark' }) {
  const [isMobile, setIsMobile] = useState(false)
  const [activeInsight, setActiveInsight] = useState<ChartInsight | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState<Record<string, string>>(() => loadAnalysisNotesLocal())
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const isDark = theme === 'dark'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    saveAnalysisNotesLocal(analysisNotes)
  }, [analysisNotes])

  useEffect(() => {
    const unsub = subscribeAnalysisNotes((notes: Record<string, string>) => {
      setAnalysisNotes(notes)
      saveAnalysisNotesLocal(notes)
    })
    return () => unsub()
  }, [])

  function saveAnalysisNote(chartId: string, note: string) {
    setAnalysisNotes((prev) => ({ ...prev, [chartId]: note }))
    setSavingNoteId(chartId)
    updateAnalysisNote(chartId, note)
      .catch(() => {
        // Keep the local value visible; the Firestore snapshot will reconcile on success.
      })
      .finally(() => {
        setSavingNoteId((current) => (current === chartId ? null : current))
      })
  }

  const completed = rows.filter(
    (r) =>
      r.shoutCount != null &&
      r.stress != null &&
      r.sleepHours != null &&
      r.studyMinutes != null &&
      r.food != null &&
      r.social != null,
  )
  const sorted = [...completed].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const labels = sorted.map((r) => fmtShort(r.dateISO))
  const shoutCounts = sorted.map((r) => r.shoutCount as number)
  const wellBeing = sorted.map((r) => round2(r.wellBeingScore))

  const r = pearsonCorrelation(shoutCounts, wellBeing)
  const { slope, intercept } = linearRegression(shoutCounts, wellBeing)
  const pca = computeLifestylePca(sorted)

  const scatter = sorted.map((d) => [d.shoutCount as number, round2(d.wellBeingScore)])
  const xMin = 0
  const xMax = 10
  const regLine = [
    [xMin, clamp(slope * xMin + intercept, 0, 5)],
    [xMax, clamp(slope * xMax + intercept, 0, 5)],
  ]

  const pcaScatter =
    pca?.points.map((point) => ({
      value: [point.pc1, point.pc2, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterPc3 =
    pca?.points.map((point) => ({
      value: [point.pc1, point.pc3, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterPc2Pc3 =
    pca?.points.map((point) => ({
      value: [point.pc2, point.pc3, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterLow = pcaScatter.filter((point) => point.group === 'Low shout')
  const pcaScatterModerate = pcaScatter.filter((point) => point.group === 'Moderate shout')
  const pcaScatterHigh = pcaScatter.filter((point) => point.group === 'High shout')
  const pcaScatterPc3Low = pcaScatterPc3.filter((point) => point.group === 'Low shout')
  const pcaScatterPc3Moderate = pcaScatterPc3.filter((point) => point.group === 'Moderate shout')
  const pcaScatterPc3High = pcaScatterPc3.filter((point) => point.group === 'High shout')
  const pcaScatterPc2Pc3Low = pcaScatterPc2Pc3.filter((point) => point.group === 'Low shout')
  const pcaScatterPc2Pc3Moderate = pcaScatterPc2Pc3.filter((point) => point.group === 'Moderate shout')
  const pcaScatterPc2Pc3High = pcaScatterPc2Pc3.filter((point) => point.group === 'High shout')
  const pc1Scores = pca?.points.map((point) => point.pc1) ?? []
  const shoutVsPc1Scatter =
    pca?.points.map((point) => ({
      value: [point.pc1, point.shoutCount, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
    })) ?? []
  const pc1Range = pc1Scores.length > 0 ? [Math.min(...pc1Scores), Math.max(...pc1Scores)] : [-1, 1]
  const shoutVsPc1 = linearRegression(pc1Scores, pca?.points.map((point) => point.shoutCount) ?? [])
  const shoutVsPc1Line = [
    [pc1Range[0], clamp(shoutVsPc1.slope * pc1Range[0] + shoutVsPc1.intercept, 0, 10)],
    [pc1Range[1], clamp(shoutVsPc1.slope * pc1Range[1] + shoutVsPc1.intercept, 0, 10)],
  ]
  const loadings = pca?.loadings ?? []

  const axisLabelStyle = { color: isDark ? '#94a3b8' : '#64748b' }
  const splitLineStyle = { lineStyle: { color: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.08)' } }
  const axisLineStyle = { lineStyle: { color: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(0,0,0,0.12)' } }
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.95)',
    borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.2)',
    textStyle: { color: isDark ? '#e2e8f0' : '#1e293b' },
  }
  const legendTextStyle = isDark ? { color: '#cbd5e1' } : { color: '#475569' }
  const legendTextStyleMobile = isDark ? { color: '#cbd5e1', fontSize: 10 } : { color: '#475569', fontSize: 10 }
  const lineChartHeight = isMobile ? 260 : 320
  const scatterChartHeight = isMobile ? 300 : 360
  const pairScatterChartHeight = isMobile ? 280 : 320
  const chartGrid = isMobile
    ? { left: 34, right: 12, top: 24, bottom: 34 }
    : { left: 40, right: 20, top: 30, bottom: 40 }
  const scatterGrid = isMobile
    ? { left: 42, right: 12, top: 28, bottom: 44 }
    : { left: 55, right: 20, top: 30, bottom: 50 }
  const axisNameTextStyle = isMobile
    ? { color: isDark ? '#cbd5e1' : '#475569', fontSize: 11 }
    : { color: isDark ? '#cbd5e1' : '#475569' }
  const categoryAxisLabel = isMobile
    ? { ...axisLabelStyle, fontSize: 10, hideOverlap: true }
    : axisLabelStyle
  const valueAxisLabel = isMobile ? { ...axisLabelStyle, fontSize: 10 } : axisLabelStyle
  const pairMetricPairs = buildMetricPairs(PAIR_METRICS)

  const wellBeingOption = {
    backgroundColor: 'transparent',
    grid: chartGrid,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: categoryAxisLabel,
      axisLine: axisLineStyle,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 5,
      axisLabel: valueAxisLabel,
      splitLine: splitLineStyle,
    },
    tooltip: { trigger: 'axis', ...tooltipStyle },
    series: [
      {
        type: 'line',
        data: wellBeing,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 3, color: '#06b6d4' },
        itemStyle: { color: '#06b6d4' },
        areaStyle: { color: 'rgba(6,182,212,0.12)' },
      },
    ],
  }

  const shoutCountOption = {
    backgroundColor: 'transparent',
    grid: chartGrid,
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: categoryAxisLabel,
      axisLine: axisLineStyle,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      axisLabel: valueAxisLabel,
      splitLine: splitLineStyle,
    },
    tooltip: { trigger: 'axis', ...tooltipStyle },
    series: [
      {
        type: 'bar',
        data: shoutCounts,
        barWidth: '60%',
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#a855f7' },
              { offset: 1, color: 'rgba(168,85,247,0.2)' },
            ],
          },
        },
      },
    ],
  }

  const shoutVsWellBeingOption = {
    backgroundColor: 'transparent',
    grid: scatterGrid,
    xAxis: {
      type: 'value',
      min: 0,
      max: 10,
      name: 'Shout Count',
      nameLocation: 'middle',
      nameGap: isMobile ? 26 : 32,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 5,
      name: 'Well-Being Score',
      nameLocation: 'middle',
      nameGap: isMobile ? 32 : 42,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle,
      formatter: (params: { value?: [number, number] }) =>
        `Shout Count: ${params.value?.[0] ?? '--'}<br/>Well-Being: ${params.value?.[1] ?? '--'}`,
    },
    series: [
      {
        name: 'Days',
        type: 'scatter',
        data: scatter,
        symbolSize: 10,
        itemStyle: { color: '#6366f1', opacity: 0.9 },
      },
      {
        name: 'Trend',
        type: 'line',
        data: regLine,
        showSymbol: false,
        lineStyle: { width: 3, color: '#06b6d4' },
      },
    ],
  }

  const pcaPc1Pc2Option = {
    backgroundColor: 'transparent',
    grid: {
      left: isMobile ? 40 : 55,
      right: isMobile ? 10 : 20,
      top: isMobile ? 56 : 30,
      bottom: isMobile ? 40 : 50,
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 12,
      data: ['Low shout', 'Moderate shout', 'High shout'],
      itemGap: isMobile ? 10 : 18,
      textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
    },
    xAxis: {
      type: 'value',
      name: 'PC1',
      nameLocation: 'middle',
      nameGap: isMobile ? 26 : 32,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: 'value',
      name: 'PC2',
      nameLocation: 'middle',
      nameGap: isMobile ? 30 : 42,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle,
      formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
        `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>PC2: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
    },
    series: [
      {
        name: 'Low shout',
        type: 'scatter',
        data: pcaScatterLow,
        symbolSize: 12,
        itemStyle: {
          color: '#22c55e',
          shadowBlur: 18,
          shadowColor: 'rgba(34,197,94,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'Moderate shout',
        type: 'scatter',
        data: pcaScatterModerate,
        symbolSize: 12,
        itemStyle: {
          color: '#f59e0b',
          shadowBlur: 18,
          shadowColor: 'rgba(245,158,11,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'High shout',
        type: 'scatter',
        data: pcaScatterHigh,
        symbolSize: 12,
        itemStyle: {
          color: '#ef4444',
          shadowBlur: 18,
          shadowColor: 'rgba(239,68,68,0.35)',
          opacity: 0.95,
        },
      },
    ],
  }

  const shoutVsPc1Option = {
    backgroundColor: 'transparent',
    grid: scatterGrid,
    xAxis: {
      type: 'value',
      name: 'PC1',
      nameLocation: 'middle',
      nameGap: isMobile ? 26 : 32,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      name: 'Shout Count',
      nameLocation: 'middle',
      nameGap: isMobile ? 32 : 42,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle,
      formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string } }) =>
        `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>Shout Count: ${params.data?.value?.[1] ?? '--'}`,
    },
    series: [
      {
        name: 'Days',
        type: 'scatter',
        data: shoutVsPc1Scatter,
        symbolSize: 12,
        itemStyle: {
          color: '#a855f7',
          shadowBlur: 18,
          shadowColor: 'rgba(168,85,247,0.35)',
        },
      },
      {
        name: 'Trend',
        type: 'line',
        data: shoutVsPc1Line,
        showSymbol: false,
        lineStyle: { width: 3, color: '#f472b6' },
      },
    ],
  }

  const pcaPc1Pc3Option = {
    backgroundColor: 'transparent',
    grid: {
      left: isMobile ? 40 : 55,
      right: isMobile ? 10 : 20,
      top: isMobile ? 56 : 30,
      bottom: isMobile ? 40 : 50,
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 12,
      data: ['Low shout', 'Moderate shout', 'High shout'],
      itemGap: isMobile ? 10 : 18,
      textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
    },
    xAxis: {
      type: 'value',
      name: 'PC1',
      nameLocation: 'middle',
      nameGap: isMobile ? 26 : 32,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: 'value',
      name: 'PC3',
      nameLocation: 'middle',
      nameGap: isMobile ? 30 : 42,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle,
      formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
        `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>PC3: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
    },
    series: [
      {
        name: 'Low shout',
        type: 'scatter',
        data: pcaScatterPc3Low,
        symbolSize: 12,
        itemStyle: {
          color: '#22c55e',
          shadowBlur: 18,
          shadowColor: 'rgba(34,197,94,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'Moderate shout',
        type: 'scatter',
        data: pcaScatterPc3Moderate,
        symbolSize: 12,
        itemStyle: {
          color: '#f59e0b',
          shadowBlur: 18,
          shadowColor: 'rgba(245,158,11,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'High shout',
        type: 'scatter',
        data: pcaScatterPc3High,
        symbolSize: 12,
        itemStyle: {
          color: '#ef4444',
          shadowBlur: 18,
          shadowColor: 'rgba(239,68,68,0.35)',
          opacity: 0.95,
        },
      },
    ],
  }

  const pcaPc2Pc3Option = {
    backgroundColor: 'transparent',
    grid: {
      left: isMobile ? 40 : 55,
      right: isMobile ? 10 : 20,
      top: isMobile ? 56 : 30,
      bottom: isMobile ? 40 : 50,
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 12,
      data: ['Low shout', 'Moderate shout', 'High shout'],
      itemGap: isMobile ? 10 : 18,
      textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
    },
    xAxis: {
      type: 'value',
      name: 'PC2',
      nameLocation: 'middle',
      nameGap: isMobile ? 26 : 32,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    yAxis: {
      type: 'value',
      name: 'PC3',
      nameLocation: 'middle',
      nameGap: isMobile ? 30 : 42,
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle,
      formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
        `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC2: ${params.data?.value?.[0] ?? '--'}<br/>PC3: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
    },
    series: [
      {
        name: 'Low shout',
        type: 'scatter',
        data: pcaScatterPc2Pc3Low,
        symbolSize: 12,
        itemStyle: {
          color: '#22c55e',
          shadowBlur: 18,
          shadowColor: 'rgba(34,197,94,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'Moderate shout',
        type: 'scatter',
        data: pcaScatterPc2Pc3Moderate,
        symbolSize: 12,
        itemStyle: {
          color: '#f59e0b',
          shadowBlur: 18,
          shadowColor: 'rgba(245,158,11,0.35)',
          opacity: 0.95,
        },
      },
      {
        name: 'High shout',
        type: 'scatter',
        data: pcaScatterPc2Pc3High,
        symbolSize: 12,
        itemStyle: {
          color: '#ef4444',
          shadowBlur: 18,
          shadowColor: 'rgba(239,68,68,0.35)',
          opacity: 0.95,
        },
      },
    ],
  }

  const loadingsOption = {
    backgroundColor: 'transparent',
    legend: {
      top: 0,
      itemGap: isMobile ? 10 : 18,
      textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
    },
    grid: {
      left: isMobile ? 34 : 45,
      right: isMobile ? 12 : 20,
      top: isMobile ? 54 : 40,
      bottom: isMobile ? 34 : 45,
    },
    xAxis: {
      type: 'category',
      data: loadings.map((item) => item.variable),
      axisLabel: categoryAxisLabel,
      axisLine: axisLineStyle,
    },
    yAxis: {
      type: 'value',
      min: -1,
      max: 1,
      name: 'Loading',
      nameTextStyle: axisNameTextStyle,
      axisLabel: valueAxisLabel,
      axisLine: axisLineStyle,
      splitLine: splitLineStyle,
    },
    tooltip: { trigger: 'axis', ...tooltipStyle },
    series: [
      {
        name: 'PC1 Loadings',
        type: 'bar',
        data: loadings.map((item) => item.pc1),
        barMaxWidth: 28,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: '#10b981',
        },
      },
      {
        name: 'PC2 Loadings',
        type: 'bar',
        data: loadings.map((item) => item.pc2),
        barMaxWidth: 28,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: '#ec4899',
        },
      },
      {
        name: 'PC3 Loadings',
        type: 'bar',
        data: loadings.map((item) => item.pc3),
        barMaxWidth: 28,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: '#f97316',
        },
      },
    ],
  }

  const pairCharts = pairMetricPairs.map(({ x, y }) => {
    const xMax = x.max ?? metricMax(sorted, x.key, x.min)
    const yMax = y.max ?? metricMax(sorted, y.key, y.min)
    const pairData = spreadOverlappingPairPoints({
      rows: sorted,
      x,
      y,
      xMin: x.min,
      xMax,
      yMin: y.min,
      yMax,
    })
    const lowData = pairData.filter((point) => point.group === 'Low shout')
    const moderateData = pairData.filter((point) => point.group === 'Moderate shout')
    const highData = pairData.filter((point) => point.group === 'High shout')

    const option = {
      backgroundColor: 'transparent',
      grid: {
        left: isMobile ? 42 : 55,
        right: isMobile ? 10 : 20,
        top: isMobile ? 54 : 38,
        bottom: isMobile ? 42 : 52,
      },
      legend: {
        top: 0,
        itemWidth: 10,
        itemHeight: 10,
        data: ['Low shout', 'Moderate shout', 'High shout'],
        itemGap: isMobile ? 8 : 16,
        textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
      },
      xAxis: {
        type: 'value',
        min: x.min,
        max: xMax,
        name: x.shortLabel,
        nameLocation: 'middle',
        nameGap: isMobile ? 26 : 32,
        nameTextStyle: axisNameTextStyle,
        axisLabel: valueAxisLabel,
        axisLine: axisLineStyle,
        splitLine: splitLineStyle,
      },
      yAxis: {
        type: 'value',
        min: y.min,
        max: yMax,
        name: y.shortLabel,
        nameLocation: 'middle',
        nameGap: isMobile ? 32 : 42,
        nameTextStyle: axisNameTextStyle,
        axisLabel: valueAxisLabel,
        axisLine: axisLineStyle,
        splitLine: splitLineStyle,
      },
      tooltip: {
        trigger: 'item',
        ...tooltipStyle,
        formatter: (params: {
          data?: { value?: [number, number, number]; rawValue?: [number, number]; dateLabel?: string; shoutCount?: number }
        }) =>
          `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>${x.label}: ${params.data?.rawValue?.[0] ?? '--'}<br/>${y.label}: ${params.data?.rawValue?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
      },
      series: [
        {
          name: 'Low shout',
          type: 'scatter',
          data: lowData,
          symbolSize: 10,
          itemStyle: {
            color: '#22c55e',
            shadowBlur: 14,
            shadowColor: 'rgba(34,197,94,0.3)',
            opacity: 0.9,
          },
        },
        {
          name: 'Moderate shout',
          type: 'scatter',
          data: moderateData,
          symbolSize: 10,
          itemStyle: {
            color: '#f59e0b',
            shadowBlur: 14,
            shadowColor: 'rgba(245,158,11,0.3)',
            opacity: 0.9,
          },
        },
        {
          name: 'High shout',
          type: 'scatter',
          data: highData,
          symbolSize: 10,
          itemStyle: {
            color: '#ef4444',
            shadowBlur: 14,
            shadowColor: 'rgba(239,68,68,0.3)',
            opacity: 0.9,
          },
        },
      ],
    }

    const xs = sorted.map((row) => metricValue(row, x.key))
    const ys = sorted.map((row) => metricValue(row, y.key))
    const pairR = pearsonCorrelation(xs, ys)
    const lowMeanX = meanValue(lowData.map((point) => point.rawValue[0]))
    const moderateMeanX = meanValue(moderateData.map((point) => point.rawValue[0]))
    const highMeanX = meanValue(highData.map((point) => point.rawValue[0]))
    const lowMeanY = meanValue(lowData.map((point) => point.rawValue[1]))
    const moderateMeanY = meanValue(moderateData.map((point) => point.rawValue[1]))
    const highMeanY = meanValue(highData.map((point) => point.rawValue[1]))
    const xStd = sampleStd(xs)
    const yStd = sampleStd(ys)
    const lowModerateOverlap = pairGroupOverlap(pairData, 'Low shout', 'Moderate shout')
    const lowHighOverlap = pairGroupOverlap(pairData, 'Low shout', 'High shout')
    const moderateHighOverlap = pairGroupOverlap(pairData, 'Moderate shout', 'High shout')

    let overlapReading =
      'The three shout groups still share some common region in the plot, so the relationship is gradual rather than forming perfectly separate clusters.'
    if (lowModerateOverlap && !lowHighOverlap) {
      overlapReading =
        'Low-shout and moderate-shout days overlap in this plot, but low-shout and high-shout days are mostly separated. That means the clearest shift appears when the study moves from calmer days into high-shout days.'
    } else if (!lowModerateOverlap && !lowHighOverlap && moderateHighOverlap) {
      overlapReading =
        'Moderate-shout and high-shout days overlap more than the low-shout group here, so low-shout days form the clearest separate cluster.'
    } else if (!lowModerateOverlap && !lowHighOverlap && !moderateHighOverlap) {
      overlapReading =
        'The shout groups are mostly separated in this pair, so the chart suggests a cleaner group difference than the other pairwise plots.'
    } else if (lowHighOverlap) {
      overlapReading =
        'Even low-shout and high-shout days still overlap here, so this pair is showing a mixed relationship rather than a fully separated group pattern.'
    }

    const insight: ChartInsight = {
      id: `${x.key}-${y.key}`,
      title: `${x.shortLabel} vs ${y.shortLabel}`,
      subtitle: `Pairwise reading between ${x.label.toLowerCase()} and ${y.label.toLowerCase()}.`,
      option,
      accentClass: `from-${x.color ? 'primary' : 'primary'} to-secondary`,
      summary:
        Math.abs(pairR) < 0.2
          ? `${x.label} and ${y.label.toLowerCase()} do not move in a strict straight line here. The scatter is fairly spread out, which means both variables are changing with day-specific context instead of one simple cause.`
          : `This pair shows a ${correlationStrength(pairR)} ${correlationDirection(pairR)} relationship. In practical terms, days with higher ${x.label.toLowerCase()} tend to align with ${pairR > 0 ? `higher ${y.label.toLowerCase()}` : `lower ${y.label.toLowerCase()}`}, but the spread still shows real day-to-day variation.`,
      bullets: [
        `Across all completed days, the Pearson correlation is ${formatNumber(pairR, 3)}, so the relationship is ${correlationStrength(pairR)} rather than perfectly fixed.`,
        overlapReading,
        `The average point for low-shout days is around ${formatNumber(lowMeanX)} ${x.shortLabel} and ${formatNumber(lowMeanY)} ${y.shortLabel}, while high-shout days sit around ${formatNumber(highMeanX)} and ${formatNumber(highMeanY)}. That difference helps show how the clusters shift between calmer and more intense days.`,
      ],
      stats: [
        { label: 'Pearson r', value: formatNumber(pairR, 3) },
        {
          label: 'Low Shout Avg',
          value: `${x.shortLabel} ${formatNumber(lowMeanX)} | ${y.shortLabel} ${formatNumber(lowMeanY)}`,
        },
        {
          label: 'Moderate Shout Avg',
          value: `${x.shortLabel} ${formatNumber(moderateMeanX)} | ${y.shortLabel} ${formatNumber(moderateMeanY)}`,
        },
        {
          label: 'High Shout Avg',
          value: `${x.shortLabel} ${formatNumber(highMeanX)} | ${y.shortLabel} ${formatNumber(highMeanY)}`,
        },
        {
          label: 'Std. Deviation',
          value: `${x.shortLabel} ${formatNumber(xStd)} | ${y.shortLabel} ${formatNumber(yStd)}`,
        },
      ],
    }

    return {
      key: `${x.key}-${y.key}`,
      title: `${x.shortLabel} vs ${y.shortLabel}`,
      description: `Daily relationship between ${x.label.toLowerCase()} and ${y.label.toLowerCase()}.`,
      option,
      insight,
    }
  })

  const noteEnabledChartIds = new Set<string>([
    'well-being-line',
    'shout-vs-wellbeing',
    ...pairCharts.map((chart) => chart.key),
  ])

  const insights = useMemo(() => {
    const dayIndex = sorted.map((_, index) => index + 1)
    const timeTrend = linearRegression(dayIndex, wellBeing).slope
    const lowScoreDays = sorted.filter((row) => row.wellBeingScore <= 3).length
    const wellBeingDiffs = consecutiveDiffs(wellBeing)
    const absWellBeingDiffs = wellBeingDiffs.map((diff) => Math.abs(diff))
    const avgAbsWellBeingDiff = meanValue(absWellBeingDiffs)
    const maxAbsWellBeingDiff = maxValue(absWellBeingDiffs)
    const riseTransitions = wellBeingDiffs.filter((diff) => diff > 0).length
    const fallTransitions = wellBeingDiffs.filter((diff) => diff < 0).length
    const largeStepChanges = absWellBeingDiffs.filter((diff) => diff >= 0.75).length
    const factorAverages = [
      { label: 'stress regulation', value: meanValue(sorted.map((row) => row.stressScore)) },
      { label: 'sleep support', value: meanValue(sorted.map((row) => row.sleepScore)) },
      { label: 'study contribution', value: meanValue(sorted.map((row) => row.studyScore)) },
      { label: 'food quality', value: meanValue(sorted.map((row) => row.foodScore)) },
      { label: 'social support', value: meanValue(sorted.map((row) => row.socialScore)) },
    ].sort((a, b) => b.value - a.value)
    const strongestFactor = factorAverages[0]
    const weakestFactor = factorAverages[factorAverages.length - 1]

    const lowShoutCount = shoutCounts.filter((count) => count <= 3).length
    const moderateShoutCount = shoutCounts.filter((count) => count >= 4 && count <= 6).length
    const highShoutCount = shoutCounts.filter((count) => count >= 7).length

    const pc1ShoutR = pearsonCorrelation(pc1Scores, shoutCounts)
    const pc1Pc2Variance = (pca?.explainedVariance.pc1 ?? 0) + (pca?.explainedVariance.pc2 ?? 0)
    const pc1Pc3Variance = (pca?.explainedVariance.pc1 ?? 0) + (pca?.explainedVariance.pc3 ?? 0)
    const pc2Pc3Variance = (pca?.explainedVariance.pc2 ?? 0) + (pca?.explainedVariance.pc3 ?? 0)

    const pc1GroupMeans = pca?.points.map((point) => ({ group: shoutGroupLabel(point.shoutCount), value: point.pc1 })) ?? []
    const pc2GroupMeans = pca?.points.map((point) => ({ group: shoutGroupLabel(point.shoutCount), value: point.pc2 })) ?? []
    const pc3GroupMeans = pca?.points.map((point) => ({ group: shoutGroupLabel(point.shoutCount), value: point.pc3 })) ?? []

    const pc1Dominant = dominantLoading(loadings, 'pc1')
    const pc2Dominant = dominantLoading(loadings, 'pc2')
    const pc3Dominant = dominantLoading(loadings, 'pc3')
    const pc1Positive = strongestSignedLoading(loadings, 'pc1', 'positive')
    const pc1Negative = strongestSignedLoading(loadings, 'pc1', 'negative')
    const pc2Positive = strongestSignedLoading(loadings, 'pc2', 'positive')
    const pc2Negative = strongestSignedLoading(loadings, 'pc2', 'negative')
    const pc3Positive = strongestSignedLoading(loadings, 'pc3', 'positive')
    const pc3Negative = strongestSignedLoading(loadings, 'pc3', 'negative')

    const wellBeingInsight: ChartInsight = {
      id: 'well-being-line',
      title: 'Well-Being Score (0–5)',
      subtitle: 'Day-wise variation in the combined well-being score.',
      option: wellBeingOption,
      accentClass: 'from-cyan-500 to-blue-500',
      summary: `The well-being line is ${trendDescription(timeTrend)}, but it is not jumping randomly from one extreme to another. The score mostly rises and falls in a gradual way, which suggests multiple confounding factors are working together rather than one single sudden cause dominating the pattern.`,
      bullets: [
        `Across consecutive days, the average absolute score change is only ${formatNumber(avgAbsWellBeingDiff)}, while the full score range runs from ${formatNumber(minValue(wellBeing))} to ${formatNumber(maxValue(wellBeing))}. That supports a gradual rise-and-fall pattern more than abrupt one-day shocks.`,
        `There are ${riseTransitions} rising transitions and ${fallTransitions} falling transitions, which means the line is moving in both directions over time instead of drifting only upward or only downward. Only ${largeStepChanges} transitions are at or above 0.75 points, so larger jumps are limited rather than constant.`,
        `Because the total score is built from five variables, confounding factors are naturally involved. Among them, the strongest average support comes from ${strongestFactor?.label ?? 'the strongest factor'}, while the weakest average support comes from ${weakestFactor?.label ?? 'the weakest factor'}. This imbalance helps explain why the curve changes gradually as different lifestyle dimensions combine on each day.`,
        `${lowScoreDays} days fall into the ${scoreBandLabel(3)} band at or below 3.00, but those lower-score days are spread within a broader wave-like pattern rather than appearing as isolated random collapses.`,
      ],
      stats: [
        { label: 'Average Score', value: formatNumber(meanValue(wellBeing)) },
        { label: 'Std. Dev.', value: formatNumber(sampleStd(wellBeing)) },
        { label: 'Avg. Day Change', value: formatNumber(avgAbsWellBeingDiff) },
        { label: 'Largest Day Change', value: formatNumber(maxAbsWellBeingDiff) },
      ],
    }

    const shoutCountInsight: ChartInsight = {
      id: 'shout-count-bar',
      title: 'Shout Count (0–10)',
      subtitle: 'Daily count of shouting episodes over the study period.',
      option: shoutCountOption,
      accentClass: 'from-violet-500 to-fuchsia-500',
      summary: 'The shout-count bars show clear variation across days rather than one stable level. There are calmer periods, moderate clusters, and several strong spikes, which means shouting intensity changes meaningfully over the study timeline.',
      bullets: [
        `The average shout count is ${formatNumber(meanValue(shoutCounts))}, with a range from ${formatNumber(minValue(shoutCounts), 0)} to ${formatNumber(maxValue(shoutCounts), 0)} episodes per day.`,
        `${lowShoutCount} days fall in the low-shout band, ${moderateShoutCount} days fall in the moderate band, and ${highShoutCount} days fall in the high/extreme band.`,
        `Because the distribution covers almost the full 0-10 range, shout count works as a meaningful changing outcome variable rather than a nearly constant measure.`,
      ],
      stats: [
        { label: 'Average Count', value: formatNumber(meanValue(shoutCounts)) },
        { label: 'Std. Dev.', value: formatNumber(sampleStd(shoutCounts)) },
        { label: 'High/Extreme Days', value: String(highShoutCount) },
        { label: 'Low-Shout Days', value: String(lowShoutCount) },
      ],
    }

    const shoutVsWellBeingInsight: ChartInsight = {
      id: 'shout-vs-wellbeing',
      title: 'Shout Count vs Well-Being',
      subtitle: 'Scatter plot with regression line between shouting frequency and well-being.',
      option: shoutVsWellBeingOption,
      accentClass: 'from-cyan-500 to-indigo-500',
      summary: `This graph shows a ${correlationStrength(r)} ${correlationDirection(r)} relationship between shout count and well-being. In general, higher shouting days tend to align with lower well-being scores, but the points still keep some vertical spread because the five lifestyle variables do not move identically every day.`,
      bullets: [
        `The Pearson correlation is ${formatNumber(r, 3)}, which supports a negative association rather than a random cloud.`,
        `The fitted line slope is ${formatSigned(slope, 3)}, so each extra shout episode is linked with an average decrease in well-being on the regression line.`,
        `Because multiple points sit at the same shout count with different well-being scores, shouting alone is not the only driver. Stress, sleep, study, food, and social differences still matter inside each shout band.`,
      ],
      stats: [
        { label: 'Pearson r', value: formatNumber(r, 3) },
        { label: 'Slope', value: formatSigned(slope, 3) },
        { label: 'Well-Being Range', value: `${formatNumber(minValue(wellBeing))} to ${formatNumber(maxValue(wellBeing))}` },
        { label: 'Data Points', value: String(scatter.length) },
      ],
    }

    const pcaPc1Pc2Insight: ChartInsight = {
      id: 'pca-pc1-pc2',
      title: 'PCA Plot (PC1 vs PC2)',
      subtitle: 'First two principal components of the five lifestyle variables.',
      option: pcaPc1Pc2Option,
      accentClass: 'from-emerald-500 to-pink-500',
      summary: `PC1 and PC2 together explain ${formatNumber(pc1Pc2Variance * 100, 1)}% of the standardized lifestyle variation. That means this plot already captures most of the main structure in the five-variable lifestyle dataset.`,
      bullets: [
        `Low-shout days center around PC1 = ${formatNumber(groupMean(pc1GroupMeans, 'Low shout'))}, while high-shout days center around PC1 = ${formatNumber(groupMean(pc1GroupMeans, 'High shout'))}. That shift suggests PC1 is helping separate calmer and more intense days.`,
        `PC2 adds a second layer of variation, but its explained variance (${formatNumber((pca?.explainedVariance.pc2 ?? 0) * 100, 1)}%) is smaller than PC1, so it is a secondary pattern rather than the main one.`,
        `The overlap between colors shows that shout level is related to the PCA structure, but not perfectly separated. Lifestyle states still mix across groups.`,
      ],
      stats: [
        { label: 'PC1 Variance', value: `${formatNumber((pca?.explainedVariance.pc1 ?? 0) * 100, 1)}%` },
        { label: 'PC2 Variance', value: `${formatNumber((pca?.explainedVariance.pc2 ?? 0) * 100, 1)}%` },
        { label: 'Low PC1 Mean', value: formatNumber(groupMean(pc1GroupMeans, 'Low shout')) },
        { label: 'High PC1 Mean', value: formatNumber(groupMean(pc1GroupMeans, 'High shout')) },
      ],
    }

    const shoutVsPc1Insight: ChartInsight = {
      id: 'shout-vs-pc1',
      title: 'Shout Count vs PC1',
      subtitle: 'Relationship between the main PCA lifestyle axis and shout count.',
      option: shoutVsPc1Option,
      accentClass: 'from-fuchsia-500 to-pink-500',
      summary: `PC1 has a ${correlationStrength(pc1ShoutR)} ${correlationDirection(pc1ShoutR)} relationship with shout count. So the main lifestyle pattern extracted by PCA is not abstract only; it is clearly connected to the outcome variable of shouting frequency.`,
      bullets: [
        `The regression slope is ${formatSigned(shoutVsPc1.slope, 3)}, which means moving to a higher PC1 position is linked with ${shoutVsPc1.slope > 0 ? 'more' : 'fewer'} shout episodes on average.`,
        `Because PC1 is a combined lifestyle axis, this graph summarizes stress, sleep, study, food, and social interaction into one dimension before comparing it with shout count.`,
        `The strong diagonal arrangement in the plot indicates that PC1 is carrying a meaningful portion of the behavioral signal related to shouting.`,
      ],
      stats: [
        { label: 'Pearson r', value: formatNumber(pc1ShoutR, 3) },
        { label: 'Slope', value: formatSigned(shoutVsPc1.slope, 3) },
        { label: 'PC1 Range', value: `${formatNumber(minValue(pc1Scores))} to ${formatNumber(maxValue(pc1Scores))}` },
        { label: 'Data Points', value: String(shoutVsPc1Scatter.length) },
      ],
    }

    const pcaPc1Pc3Insight: ChartInsight = {
      id: 'pca-pc1-pc3',
      title: 'PCA Plot (PC1 vs PC3)',
      subtitle: 'Primary and third PCA directions compared side by side.',
      option: pcaPc1Pc3Option,
      accentClass: 'from-emerald-500 to-orange-500',
      summary: `PC1 and PC3 together explain ${formatNumber(pc1Pc3Variance * 100, 1)}% of total variance. This view keeps the main lifestyle axis while replacing PC2 with a smaller third pattern to see whether extra structure still appears.`,
      bullets: [
        `PC3 explains ${formatNumber((pca?.explainedVariance.pc3 ?? 0) * 100, 1)}% of the variance, so it is a finer layer of structure rather than the dominant one.`,
        `Low-shout and high-shout groups are still more clearly separated along PC1 than along PC3, which means the first component remains the key summary axis.`,
        `Any vertical spread on PC3 shows more subtle combinations of the five variables that are not already captured by PC1 alone.`,
      ],
      stats: [
        { label: 'PC1 Variance', value: `${formatNumber((pca?.explainedVariance.pc1 ?? 0) * 100, 1)}%` },
        { label: 'PC3 Variance', value: `${formatNumber((pca?.explainedVariance.pc3 ?? 0) * 100, 1)}%` },
        { label: 'Low PC3 Mean', value: formatNumber(groupMean(pc3GroupMeans, 'Low shout')) },
        { label: 'High PC3 Mean', value: formatNumber(groupMean(pc3GroupMeans, 'High shout')) },
      ],
    }

    const pcaPc2Pc3Insight: ChartInsight = {
      id: 'pca-pc2-pc3',
      title: 'PCA Plot (PC2 vs PC3)',
      subtitle: 'Secondary and tertiary PCA structure after removing PC1.',
      option: pcaPc2Pc3Option,
      accentClass: 'from-pink-500 to-orange-500',
      summary: `PC2 and PC3 together explain ${formatNumber(pc2Pc3Variance * 100, 1)}% of variance. This is the residual lifestyle structure left after the dominant PC1 pattern is removed.`,
      bullets: [
        `Compared with PC1-based plots, the clustering here is more mixed, which is expected because these two components explain less variance than the first one.`,
        `PC2 group means still differ between low-shout days (${formatNumber(groupMean(pc2GroupMeans, 'Low shout'))}) and high-shout days (${formatNumber(groupMean(pc2GroupMeans, 'High shout'))}), but not as strongly as PC1.`,
        `This plot is useful for checking hidden subpatterns, not for the main overall relationship. The strongest broad signal still sits in PC1.`,
      ],
      stats: [
        { label: 'PC2 Variance', value: `${formatNumber((pca?.explainedVariance.pc2 ?? 0) * 100, 1)}%` },
        { label: 'PC3 Variance', value: `${formatNumber((pca?.explainedVariance.pc3 ?? 0) * 100, 1)}%` },
        { label: 'Low PC2 Mean', value: formatNumber(groupMean(pc2GroupMeans, 'Low shout')) },
        { label: 'High PC2 Mean', value: formatNumber(groupMean(pc2GroupMeans, 'High shout')) },
      ],
    }

    const loadingsInsight: ChartInsight = {
      id: 'pca-loadings',
      title: 'PC1, PC2 and PC3 Loadings',
      subtitle: 'These loadings show how strongly each lifestyle variable contributes to each principal component.',
      option: loadingsOption,
      accentClass: 'from-emerald-500 to-amber-500',
      summary:
        'The loading bars explain what each principal component is actually made of. Positive bars move in the same direction as that component, while negative bars move in the opposite direction, so both sign and size matter here.',
      bullets: [
        pc1Positive || pc1Negative
          ? `PC1 is mainly shaped by ${pc1Positive ? `${pcaVariableLabel(pc1Positive.variable)} (${formatSigned(pc1Positive.pc1, 2)})` : 'its strongest positive side'} and ${pc1Negative ? `${pcaVariableLabel(pc1Negative.variable)} (${formatSigned(pc1Negative.pc1, 2)})` : 'no strong negative contrast'}. So PC1 is acting like a contrast between these directions, not just one single variable.`
          : 'PC1 loading information is not available.',
        pc2Positive || pc2Negative
          ? `PC2 is most influenced by ${pc2Positive ? `${pcaVariableLabel(pc2Positive.variable)} on the positive side (${formatSigned(pc2Positive.pc2, 2)})` : 'its positive side'} and ${pc2Negative ? `${pcaVariableLabel(pc2Negative.variable)} on the negative side (${formatSigned(pc2Negative.pc2, 2)})` : 'no major negative side'}. That means PC2 separates those two kinds of lifestyle movement.`
          : 'PC2 loading information is not available.',
        pc3Positive || pc3Negative
          ? `PC3 is driven most by ${pc3Positive ? `${pcaVariableLabel(pc3Positive.variable)} on the positive side (${formatSigned(pc3Positive.pc3, 2)})` : 'its positive side'} and ${pc3Negative ? `${pcaVariableLabel(pc3Negative.variable)} on the negative side (${formatSigned(pc3Negative.pc3, 2)})` : 'no major negative side'}. This is the finer third pattern after PC1 and PC2 are already removed.`
          : 'PC3 loading information is not available.',
      ],
      stats: [
        {
          label: 'Top |PC1| Loading',
          value: pc1Dominant ? `${pcaVariableLabel(pc1Dominant.variable)} (${formatSigned(pc1Dominant.pc1, 2)})` : '--',
        },
        {
          label: 'Top |PC2| Loading',
          value: pc2Dominant ? `${pcaVariableLabel(pc2Dominant.variable)} (${formatSigned(pc2Dominant.pc2, 2)})` : '--',
        },
        {
          label: 'Top |PC3| Loading',
          value: pc3Dominant ? `${pcaVariableLabel(pc3Dominant.variable)} (${formatSigned(pc3Dominant.pc3, 2)})` : '--',
        },
        { label: 'Variables Used', value: String(loadings.length) },
      ],
    }

    return {
      wellBeingInsight,
      shoutCountInsight,
      shoutVsWellBeingInsight,
      pcaPc1Pc2Insight,
      shoutVsPc1Insight,
      pcaPc1Pc3Insight,
      pcaPc2Pc3Insight,
      loadingsInsight,
    }
  }, [
    chartGrid,
    axisLineStyle,
    axisNameTextStyle,
    categoryAxisLabel,
    loadings,
    pca,
    pcaPc1Pc2Option,
    pcaPc1Pc3Option,
    pcaPc2Pc3Option,
    pc1Scores,
    regLine,
    scatter,
    scatterGrid,
    shoutCountOption,
    shoutCounts,
    shoutVsPc1,
    shoutVsPc1Option,
    shoutVsPc1Scatter.length,
    shoutVsWellBeingOption,
    slope,
    sorted,
    splitLineStyle,
    tooltipStyle,
    valueAxisLabel,
    wellBeing,
    wellBeingOption,
    xMax,
    xMin,
    r,
    loadingsOption,
  ])

  return (
    <>
      <section className="w-full max-w-[1600px] px-3 sm:px-4 pb-10 md:pb-12 z-10">
        <div className="glass-panel w-full rounded-[28px] p-4 sm:p-6 md:p-8 ring-1 ring-slate-200/50 dark:ring-white/10 shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5 md:mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Analytics
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-6 max-w-2xl">
                Trend + correlation between shouting and well-being over 40 days.
              </p>
            </div>

            <div className="grid w-full md:w-auto grid-cols-2 md:flex gap-3">
              <Kpi label="Pearson r" value={r.toFixed(3)} glowClass="shadow-neon-accent" isDark={isDark} />
              <Kpi label="Slope" value={slope.toFixed(3)} glowClass="shadow-neon" isDark={isDark} />
              <Kpi
                label="PC1 Variance"
                value={pca ? `${(pca.explainedVariance.pc1 * 100).toFixed(1)}%` : '--'}
                glowClass="shadow-[0_0_25px_rgba(16,185,129,0.25)]"
                isDark={isDark}
              />
              <Kpi
                label="PC2 Variance"
                value={pca ? `${(pca.explainedVariance.pc2 * 100).toFixed(1)}%` : '--'}
                glowClass="shadow-[0_0_25px_rgba(236,72,153,0.22)]"
                isDark={isDark}
              />
              <Kpi
                label="PC3 Variance"
                value={pca ? `${(pca.explainedVariance.pc3 * 100).toFixed(1)}%` : '--'}
                glowClass="shadow-[0_0_25px_rgba(249,115,22,0.22)]"
                isDark={isDark}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5 md:mb-6">
            <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 xl:col-span-2">
              <h3 className="text-slate-900 dark:text-white font-bold">PCA interpretation</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-6">
                <span className="text-slate-700 dark:text-slate-200 font-semibold">PC1</span> represents the main overall lifestyle /
                well-being pattern formed from stress, sleep, study, food, and social behavior.{' '}
                <span className="text-slate-700 dark:text-slate-200 font-semibold">PC2</span> represents the secondary variation pattern that
                captures a different combination of those same lifestyle variables.{' '}
                <span className="text-slate-700 dark:text-slate-200 font-semibold">PC3</span> captures the next layer of variation after PC1
                and PC2.
              </p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-3 leading-5">
                Before PCA, stress is reversed so that higher values always mean a better condition, then all five
                lifestyle variables are converted to z-scores. That way PCA compares them on the same scale.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5">
              <h3 className="text-slate-900 dark:text-white font-bold mb-3">Explained Variance</h3>
              <VarianceRow label="PC1" value={pca?.explainedVariance.pc1 ?? 0} colorClass="from-emerald-500 to-cyan-400" />
              <VarianceRow label="PC2" value={pca?.explainedVariance.pc2 ?? 0} colorClass="from-pink-500 to-purple-400" />
              <VarianceRow label="PC3" value={pca?.explainedVariance.pc3 ?? 0} colorClass="from-orange-500 to-amber-300" />
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-4">
                Higher explained variance means that component captures more of the overall lifestyle pattern.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartCard title="Well-Being Score (0–5)" onOpenAnalysis={() => setActiveInsight(insights.wellBeingInsight)}>
              <ReactECharts style={{ height: lineChartHeight }} option={wellBeingOption} />
            </ChartCard>

            <ChartCard title="Shout Count (0–10)" onOpenAnalysis={() => setActiveInsight(insights.shoutCountInsight)}>
              <ReactECharts style={{ height: lineChartHeight }} option={shoutCountOption} />
            </ChartCard>

            <ChartCard
              title="Shout Count vs Well-Being (scatter)"
              onOpenAnalysis={() => setActiveInsight(insights.shoutVsWellBeingInsight)}
              className="xl:col-span-2"
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={shoutVsWellBeingOption} />
            </ChartCard>

            <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 xl:col-span-2 min-w-0">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold mb-1">Lifestyle Variable Pairs</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    All 10 pairwise scatter plots across stress, sleep, study, food, and social interaction.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {pairCharts.map((chart) => (
                  <div
                    key={chart.key}
                    className="rounded-2xl border border-slate-200/60 dark:border-white/5 bg-white/30 dark:bg-slate-950/10 p-3 sm:p-4 min-w-0"
                  >
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{chart.title}</h4>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">{chart.description}</p>
                      </div>
                      <div className="shrink-0 self-start">
                        <AnalysisButton onClick={() => setActiveInsight(chart.insight)} />
                      </div>
                    </div>
                    <ReactECharts style={{ height: pairScatterChartHeight }} option={chart.option} />
                  </div>
                ))}
              </div>
            </div>

            <ChartCard
              title="PCA Plot (PC1 vs PC2)"
              description="Each point is one day after PCA on stress, sleep, study, food, and social variables."
              onOpenAnalysis={() => setActiveInsight(insights.pcaPc1Pc2Insight)}
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={pcaPc1Pc2Option} />
            </ChartCard>

            <ChartCard
              title="Shout Count vs PC1"
              description="This compares the outcome variable (shoutCount) with the main PCA lifestyle pattern (PC1)."
              onOpenAnalysis={() => setActiveInsight(insights.shoutVsPc1Insight)}
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={shoutVsPc1Option} />
            </ChartCard>

            <ChartCard
              title="PCA Plot (PC1 vs PC3)"
              description="This shows the third PCA direction after PC1 and PC2, grouped by shout level."
              onOpenAnalysis={() => setActiveInsight(insights.pcaPc1Pc3Insight)}
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={pcaPc1Pc3Option} />
            </ChartCard>

            <ChartCard
              title="PCA Plot (PC2 vs PC3)"
              description="This compares the second and third PCA directions, grouped by shout level."
              onOpenAnalysis={() => setActiveInsight(insights.pcaPc2Pc3Insight)}
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={pcaPc2Pc3Option} />
            </ChartCard>

            <ChartCard
              title="PC1, PC2 and PC3 Loadings"
              description="These loadings show how strongly each lifestyle variable contributes to PC1, PC2, and PC3."
              onOpenAnalysis={() => setActiveInsight(insights.loadingsInsight)}
              className="xl:col-span-2"
            >
              <ReactECharts style={{ height: scatterChartHeight }} option={loadingsOption} />
            </ChartCard>
          </div>
        </div>
      </section>

      <AnalyticsInsightModal
        insight={activeInsight}
        open={activeInsight != null}
        onClose={() => setActiveInsight(null)}
        isMobile={isMobile}
        editableNote={activeInsight != null && noteEnabledChartIds.has(activeInsight.id)}
        savedNote={activeInsight ? analysisNotes[activeInsight.id] ?? '' : ''}
        isSavingNote={activeInsight != null && savingNoteId === activeInsight.id}
        onSaveNote={saveAnalysisNote}
      />
    </>
  )
}

function Kpi({
  label,
  value,
  glowClass,
  isDark,
}: {
  label: string
  value: string
  glowClass: string
  isDark: boolean
}) {
  return (
    <div className={`min-w-0 px-3 sm:px-4 py-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 ${isDark ? glowClass : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">{label}</div>
      <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-mono leading-none mt-1">{value}</div>
    </div>
  )
}

function VarianceRow({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number
  colorClass: string
}) {
  const pct = clamp(value * 100, 0, 100)
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-sm font-mono text-slate-900 dark:text-white">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-900/70 border border-slate-300/50 dark:border-white/5 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
