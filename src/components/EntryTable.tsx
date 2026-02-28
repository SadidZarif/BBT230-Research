import { useEffect, useRef, useState } from 'react'
import type { DailyRow, ShoutLevel, DailyRecord } from '../types'

function fmtDayDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d)
}

function levelBadge(level: ShoutLevel) {
  switch (level) {
    case 'Low':
      return {
        text: 'Low Level',
        className: 'text-green-400 bg-green-900/30',
      }
    case 'Minimal': 
      return {
        text: 'Minimal Level',
        className: 'text-cyan-300 bg-cyan-900/20',
      }
    case 'Moderate':
      return {
        text: 'Moderate Level',
        className: 'text-yellow-400 bg-yellow-900/30',
      }
    case 'High':
      return {
        text: 'High Level',
        className: 'text-red-400 bg-red-900/30',
      }
    case 'Extreme':
      return {
        text: 'Extreme',
        className: 'text-red-300 bg-red-900/40',
      }
  }
}

function isRowComplete(row: Pick<DailyRecord, 'shoutCount' | 'stress' | 'sleepHours' | 'studyMinutes' | 'food' | 'social'>) {
  return (
    row.shoutCount != null &&
    row.stress != null &&
    row.sleepHours != null &&
    row.studyMinutes != null &&
    row.food != null &&
    row.social != null
  )
}

function unsetBadge() {
  return { text: 'Unset', className: 'text-slate-400 bg-slate-900/30 border border-slate-700/50' }
}

function getPrevDay(dayNumber: number) {
  return Math.max(1, dayNumber - 1)
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampNum(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function EntryTable({
  rows,
  onUpdate,
  onViewScore,
}: {
  rows: DailyRow[]
  onUpdate: (dayNumber: number, patch: Partial<DailyRecord>) => void
  onViewScore: (row: DailyRow) => void
}) {
  const rowsAsc = [...rows].sort((a, b) => a.dayNumber - b.dayNumber)
  const completedByDay = new Map<number, boolean>(
    rowsAsc.map((r) => [r.dayNumber, isRowComplete(r)]),
  )

  const [toast, setToast] = useState<{ open: boolean; message: string }>({ open: false, message: '' })
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  function showBlockedToast(dayNumber: number) {
    const prev = getPrevDay(dayNumber)
    const msg =
      dayNumber <= 1
        ? 'Please complete Day 1 before continuing.'
        : `Please complete Day ${prev} before editing Day ${dayNumber}.`

    setToast({ open: true, message: msg })
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast({ open: false, message: '' }), 2200)
  }

  function canEditDay(dayNumber: number) {
    if (dayNumber <= 1) return true
    return completedByDay.get(dayNumber - 1) === true
  }

  return (
    <main className="w-full max-w-[1600px] flex-1 px-4 pb-12 z-10 flex flex-col overflow-hidden h-[calc(100vh-250px)]">
      <div className="glass-panel w-full h-full rounded-3xl flex flex-col overflow-hidden relative shadow-2xl shadow-black/50 ring-1 ring-white/10">
        {toast.open ? (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
            <div className="glass-card rounded-2xl px-4 py-3 border border-white/10 shadow-glass backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent text-[18px]">lock</span>
                <span className="text-sm font-semibold text-slate-200">{toast.message}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl z-20 sticky top-0 grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_1fr_180px] gap-4 items-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">Date</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
            Shout Count
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stress (1-10)</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sleep (Hrs)</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Study (Min)</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Food (1-10)</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Social (1-10)</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right pr-2">
            Action
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-2 relative" id="table-body">
          {rowsAsc.map((row) => {
            const complete = isRowComplete(row)
            const editable = canEditDay(row.dayNumber)
            const badge = row.shoutCount == null ? unsetBadge() : levelBadge(row.shoutLevel)
            return (
              <div
                key={row.dayNumber}
                className={`group relative transition-all rounded-xl border p-4 grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_1fr_180px] gap-4 items-center ${
                  editable
                    ? 'bg-slate-800/20 hover:bg-slate-700/30 border-white/5 hover:border-accent/30'
                    : 'bg-slate-800/10 border-white/5 opacity-70'
                }`}
              >
                {!editable ? (
                  <div
                    className="absolute inset-0 z-30 rounded-xl cursor-not-allowed"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      showBlockedToast(row.dayNumber)
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      showBlockedToast(row.dayNumber)
                    }}
                    title={`Please complete Day ${row.dayNumber - 1} first`}
                  />
                ) : null}

                <div className="flex flex-col">
                  <span className="font-bold text-white">Day {row.dayNumber}</span>
                  <span className="text-xs text-slate-500">{fmtDayDate(row.dateISO)}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <input
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all font-mono"
                    type="number"
                    value={row.shoutCount ?? ''}
                    min={0}
                    max={10}
                    disabled={!editable}
                    onChange={(e) =>
                      onUpdate(row.dayNumber, {
                        shoutCount: e.target.value === '' ? null : clampInt(Number(e.target.value), 0, 10),
                      })
                    }
                  />
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                </div>

                <div className="flex flex-col justify-center gap-1 px-2">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                  <input
                    className={`accent-accent range-cyan ${row.stress == null ? 'opacity-50' : ''}`}
                    max={10}
                    min={1}
                    type="range"
                    value={row.stress ?? 5}
                    disabled={!editable}
                    onChange={(e) =>
                      onUpdate(row.dayNumber, { stress: clampInt(Number(e.target.value), 1, 10) })
                    }
                  />
                  <div className="text-center text-xs font-mono text-accent">
                    {row.stress == null ? '--/10' : `${row.stress}/10`}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="relative">
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent outline-none transition-all font-mono"
                      step={0.5}
                      type="number"
                      value={row.sleepHours ?? ''}
                      min={0}
                      max={8}
                      disabled={!editable}
                      onChange={(e) =>
                        onUpdate(row.dayNumber, {
                          sleepHours: e.target.value === '' ? null : clampNum(Number(e.target.value), 0, 8),
                        })
                      }
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">h</span>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <div className="relative">
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-white focus:ring-2 focus:ring-secondary focus:border-transparent outline-none transition-all font-mono"
                      step={15}
                      type="number"
                      value={row.studyMinutes ?? ''}
                      min={0}
                      disabled={!editable}
                      onChange={(e) =>
                        onUpdate(row.dayNumber, {
                          studyMinutes: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">m</span>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-2">
                  <input
                    className={`accent-green-400 range-green ${row.food == null ? 'opacity-50' : ''}`}
                    max={10}
                    min={1}
                    type="range"
                    value={row.food ?? 5}
                    disabled={!editable}
                    onChange={(e) =>
                      onUpdate(row.dayNumber, { food: clampInt(Number(e.target.value), 1, 10) })
                    }
                  />
                  <div className="text-center text-xs font-mono text-green-400">
                    {row.food == null ? '--/10' : `${row.food}/10`}
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-1 px-2">
                  <input
                    className={`accent-purple-400 range-purple ${row.social == null ? 'opacity-50' : ''}`}
                    max={10}
                    min={1}
                    type="range"
                    value={row.social ?? 5}
                    disabled={!editable}
                    onChange={(e) =>
                      onUpdate(row.dayNumber, { social: clampInt(Number(e.target.value), 1, 10) })
                    }
                  />
                  <div className="text-center text-xs font-mono text-purple-400">
                    {row.social == null ? '--/10' : `${row.social}/10`}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => onViewScore(row)}
                    disabled={!complete || !editable}
                    className={
                      complete && editable
                        ? 'btn-3d relative inline-flex items-center justify-center px-4 py-2 overflow-hidden font-bold text-white rounded-lg group bg-gradient-to-br from-primary to-secondary'
                        : 'relative inline-flex items-center justify-center px-4 py-2 overflow-hidden font-bold rounded-lg bg-slate-800/60 text-slate-500 border border-slate-700 cursor-not-allowed'
                    }
                    title={
                      !editable
                        ? `Please complete Day ${row.dayNumber - 1} first`
                        : complete
                          ? 'View Score'
                          : 'Set all values to unlock'
                    }
                  >
                    {complete ? (
                      <span className="absolute w-0 h-0 transition-all duration-500 ease-out bg-white rounded-full group-hover:w-56 group-hover:h-56 opacity-10" />
                    ) : null}
                    <span className="relative text-xs flex items-center gap-2">
                      {complete && editable ? 'View Score' : 'Locked'}{' '}
                      <span className="material-symbols-outlined text-[16px]">visibility</span>
                    </span>
                  </button>
                </div>
              </div>
            )
          })}

          <div className="text-center pt-8 pb-4">
            <span className="text-slate-600 text-sm">Scroll for previous days...</span>
          </div>
        </div>
      </div>
    </main>
  )
}

