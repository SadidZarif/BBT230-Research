import { useEffect, useMemo, useState } from 'react'
import type { DailyRecord, DailyRow } from './types'
import { computeDailyScores } from './scoring'
import { loadRecords, normalizeRecordsToStudySchedule, saveRecords, STUDY_DAYS } from './storage'
import { EntryTable } from './components/EntryTable'
import { WellBeingModal } from './components/WellBeingModal'
import { AnalyticsView } from './components/AnalyticsView'
import { ensureSeededDays, subscribeDays, updateDay } from './firestoreDays'
import { getFirebaseInitErrorMessage } from './firebase'
import { isAllowedEmail, loginWithGoogle, logout, subscribeAuth } from './auth'
import type { User } from 'firebase/auth'

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
  const [sync, setSync] = useState<{ mode: 'cloud' | 'local' | 'error'; message?: string }>({
    mode: 'local',
  })
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authActionError, setAuthActionError] = useState<string | null>(null)

  const rows: DailyRow[] = useMemo(() => {
    return records.map((r) => ({ ...r, ...computeDailyScores(r) }))
  }, [records])

  const modalRow = useMemo(() => rows.find((r) => r.dayNumber === modalDay) ?? null, [rows, modalDay])

  useEffect(() => {
    saveRecords(records)
  }, [records])

  useEffect(() => {
    const unsub = subscribeAuth((u) => {
      setUser(u)
      setAuthReady(true)
    })
    return () => unsub()
  }, [])

  const allowed = useMemo(() => isAllowedEmail(user?.email), [user?.email])

  useEffect(() => {
    let unsub: (() => void) | null = null
    ;(async () => {
      try {
        if (!authReady) return
        if (!allowed) {
          setSync({ mode: 'local' })
          return
        }
        // Subscribe first (so we can detect auth/rules/network errors).
        unsub = subscribeDays(
          (next) => {
            setRecords(normalizeRecordsToStudySchedule(next))
            setSync({ mode: 'cloud' })
          },
          (err) => {
            const msg =
              err && typeof err === 'object' && 'message' in err
                ? String((err as { message?: unknown }).message)
                : 'Cloud sync error'
            setSync({ mode: 'error', message: msg })
          },
        )

        // Seed in background (if empty). If it fails, we still keep local fallback.
        ensureSeededDays().catch((e) => {
          const msg =
            e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Seed failed'
          setSync((s) => (s.mode === 'cloud' ? s : { mode: 'error', message: msg }))
        })
      } catch (e) {
        const msg =
          e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Cloud sync unavailable'
        setSync({ mode: 'error', message: msg })
      }
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [authReady, allowed])

  function updateRecord(dayNumber: number, patch: Partial<DailyRecord>) {
    // Optimistic UI update + async Firestore write
    setRecords((prev) => prev.map((r) => (r.dayNumber === dayNumber ? { ...r, ...patch } : r)))
    if (allowed) {
      updateDay(dayNumber, patch).catch((e) => {
        const msg =
          e && typeof e === 'object' && 'message' in e
            ? String((e as { message?: unknown }).message)
            : 'Cloud write failed'
        setSync({ mode: 'error', message: msg })
      })
    }
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

  const firebaseInitError = getFirebaseInitErrorMessage()

  if (firebaseInitError) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-6">
        <div className="glass-card max-w-xl w-full p-6 rounded-2xl border border-red-500/30">
          <h2 className="text-xl font-bold text-white mb-2">Firebase configuration missing</h2>
          <p className="text-slate-300 text-sm font-mono break-words">{firebaseInitError}</p>
          <p className="text-slate-400 text-xs mt-3">
            Fix your Vite env variables (GitHub Secrets for deploy, <code className="font-mono">.env.local</code> for
            local).
          </p>
        </div>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-6">
        <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-white/10 text-center">
          <div className="text-white font-black text-2xl mb-2">BBT230 Research</div>
          <div className="text-slate-400 text-sm">Checking sign-in status…</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* background blobs */}
        <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="fixed top-[10%] right-[20%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none z-0" />

        <div className="glass-card max-w-lg w-full p-7 sm:p-8 rounded-3xl border border-white/10 shadow-glass relative z-10">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 drop-shadow-lg">
            BBT230 Research
          </h1>
          <p className="mt-2 text-slate-400 text-sm">
            Sign in with the authorized Google account to access the 40-day study dashboard.
          </p>

          {authActionError ? (
            <div className="mt-4 text-xs font-mono text-red-300 bg-red-900/20 border border-red-500/20 rounded-xl p-3">
              {authActionError}
            </div>
          ) : null}

          <button
            className="btn-3d mt-6 w-full py-3 rounded-xl font-bold tracking-wide"
            onClick={async () => {
              setAuthActionError(null)
              try {
                await loginWithGoogle()
              } catch (e) {
                const msg =
                  e && typeof e === 'object' && 'message' in e
                    ? String((e as { message?: unknown }).message)
                    : 'Sign-in failed'
                setAuthActionError(msg)
              }
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-6">
        <div className="glass-card max-w-lg w-full p-7 rounded-3xl border border-red-500/20 shadow-glass text-center">
          <h2 className="text-2xl font-black text-white">Access denied</h2>
          <p className="mt-2 text-slate-400 text-sm">
            You are signed in as <span className="font-mono text-slate-200">{user.email ?? 'unknown'}</span>, but this
            app is restricted to:
          </p>
          <div className="mt-3 font-mono text-sm text-accent">samia.ridheeka.251@northsouth.edu</div>
          <button
            className="btn-3d mt-6 w-full py-3 rounded-xl font-bold tracking-wide"
            onClick={async () => {
              await logout()
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col items-center relative">
      {/* background blobs (match HTML) */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-[10%] right-[20%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none z-0" />

      <header className="w-full max-w-[1600px] px-4 sm:px-6 py-8 md:py-12 z-10 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 drop-shadow-lg mb-2">
          BBT230 Research
        </h1>
        <p className="text-lg md:text-xl font-medium text-accent tracking-wide uppercase">
          by Samia Chowdhury Ridheeka
        </p>

        <div className="mt-3 text-xs font-mono text-slate-400 max-w-full break-all px-4 leading-5">
          Signed in as <span className="text-slate-200">{user.email}</span>{' '}
          <button className="text-primary hover:underline ml-2 inline" onClick={() => logout()}>
            Sign out
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 backdrop-blur-sm">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <span className="text-sm text-slate-300 font-medium">
            Study Active: Day {completedDays} of {totalDays}
          </span>
        </div>

        <div className="mt-3 text-xs font-mono text-slate-400 px-4 break-words">
          {sync.mode === 'cloud' ? (
            <span className="text-green-300">Cloud Sync: Connected</span>
          ) : sync.mode === 'error' ? (
            <span className="text-red-300">Cloud Sync: Error — {sync.message ?? 'unknown'}</span>
          ) : (
            <span className="text-yellow-300">Cloud Sync: Local only (not connected)</span>
          )}
        </div>
      </header>

      <EntryTable rows={rows} onUpdate={updateRecord} onViewScore={(row) => setModalDay(row.dayNumber)} />

      <div className="pb-6 px-4 text-slate-500 text-xs font-mono z-10 flex flex-col items-start gap-1 sm:items-center sm:text-center">
        <span>Data automatically saved locally.</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-center">
          <button
            className="text-primary cursor-pointer hover:underline"
            onClick={() => downloadTextFile('bbt230-research.csv', toCsv(rows))}
          >
            Export to CSV
          </button>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <button className="text-primary cursor-pointer hover:underline" onClick={() => setAnalyticsOpen((v) => !v)}>
            {analyticsOpen ? 'Hide Analytics' : 'Show Analytics'}
          </button>
        </div>
      </div>

      {analyticsOpen ? <AnalyticsView rows={rows} /> : null}

      <WellBeingModal open={modalDay != null} row={modalRow} onClose={() => setModalDay(null)} />
    </div>
  )
}
