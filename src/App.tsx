import { useEffect, useMemo, useState } from 'react'
import type { DailyRecord, DailyRow } from './types'
import { computeDailyScores } from './scoring'
import { loadRecords, normalizeRecordsToStudySchedule, saveRecords, STUDY_DAYS } from './storage'
import { EntryTable } from './components/EntryTable'
import { WellBeingModal } from './components/WellBeingModal'
import { AnalyticsView } from './components/AnalyticsView'
import { ensureSeededDays, subscribeDays, updateDay } from './firestoreDays'

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function toCsv(rows: DailyRow[]) {
  const header = [
    'Date',
    'Day',
    'ShoutCount',
    'ShoutLevel',
    'Stress',
    'SocialInteraction',
    'SleepHours',
    'StudyMinutes',
    'FoodScore',
    'WellBeingScore',
  ]

  const lines = rows
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .map((r) =>
      [
        r.dateISO,
        r.dayNumber,
        r.shoutCount ?? '',
        r.shoutLevel,
        r.stress ?? '',
        r.social ?? '',
        r.sleepHours ?? '',
        r.studyMinutes ?? '',
        r.food ?? '',
        r.wellBeingScore.toFixed(2),
      ].join(','),
    )

  return [header.join(','), ...lines].join('\n')
}

export default function App() {
  const [records, setRecords] = useState<DailyRecord[]>(() =>
    normalizeRecordsToStudySchedule(loadRecords()),
  )
  const [modalDay, setModalDay] = useState<number | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  const rows: DailyRow[] = useMemo(() => {
    return records.map((r) => ({ ...r, ...computeDailyScores(r) }))
  }, [records])

  const modalRow = useMemo(() => rows.find((r) => r.dayNumber === modalDay) ?? null, [rows, modalDay])

  useEffect(() => {
    saveRecords(records)
  }, [records])

  useEffect(() => {
    let unsub: (() => void) | null = null
    ;(async () => {
      try {
        await ensureSeededDays()
        unsub = subscribeDays((next) => {
          setRecords(normalizeRecordsToStudySchedule(next))
        })
      } catch {
        // If Firestore is unavailable (offline / rules), localStorage remains the fallback.
      }
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  function updateRecord(dayNumber: number, patch: Partial<DailyRecord>) {
    // Optimistic UI update + async Firestore write
    setRecords((prev) => prev.map((r) => (r.dayNumber === dayNumber ? { ...r, ...patch } : r)))
    updateDay(dayNumber, patch).catch(() => {})
  }

  const totalDays = STUDY_DAYS
  // Sequential flow: "Study Active" counts how many consecutive days from Day 1 are complete.
  const completedDays = (() => {
    const sorted = [...records].sort((a, b) => a.dayNumber - b.dayNumber)
    let n = 0
    for (const r of sorted) {
      const complete =
        r.shoutCount != null &&
        r.stress != null &&
        r.sleepHours != null &&
        r.studyMinutes != null &&
        r.food != null &&
        r.social != null
      if (!complete) break
      n += 1
    }
    return n
  })()

  return (
    <div className="w-full flex flex-col items-center relative">
      {/* background blobs (match HTML) */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-[10%] right-[20%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none z-0" />

      <header className="w-full max-w-[1600px] px-6 py-8 md:py-12 z-10 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 drop-shadow-lg mb-2">
          BBT230 Research
        </h1>
        <p className="text-lg md:text-xl font-medium text-accent tracking-wide uppercase">
          by Samia Chowdhury Ridheeka
        </p>

        <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-sm text-slate-300 font-medium">
            Study Active: Day {completedDays} of {totalDays}
          </span>
        </div>
      </header>

      <EntryTable rows={rows} onUpdate={updateRecord} onViewScore={(row) => setModalDay(row.dayNumber)} />

      <div className="pb-6 text-slate-500 text-xs font-mono z-10">
        Data automatically saved locally.{' '}
        <button
          className="text-primary cursor-pointer hover:underline"
          onClick={() => downloadTextFile('bbt230-research.csv', toCsv(rows))}
        >
          Export to CSV
        </button>
        <span className="mx-2 text-slate-600">|</span>
        <button className="text-primary cursor-pointer hover:underline" onClick={() => setAnalyticsOpen((v) => !v)}>
          {analyticsOpen ? 'Hide Analytics' : 'Show Analytics'}
        </button>
      </div>

      {analyticsOpen ? <AnalyticsView rows={rows} /> : null}

      <WellBeingModal open={modalDay != null} row={modalRow} onClose={() => setModalDay(null)} />
    </div>
  )
}
