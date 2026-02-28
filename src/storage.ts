import type { DailyRecord, ISODate } from './types'

// v2 switches to nullable inputs + lock/unlock flow
const STORAGE_KEY = 'bbt230.research.v2'
export const STUDY_DAYS = 40
export const STUDY_START_ISO = '2026-02-20' as ISODate

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function toISODate(d: Date): ISODate {
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  return `${yyyy}-${mm}-${dd}` as ISODate
}

function isoToLocalDate(iso: ISODate): Date {
  const [yyyy, mm, dd] = iso.split('-').map((x) => Number(x))
  const d = new Date(yyyy!, (mm ?? 1) - 1, dd ?? 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function generateDefaultRecords(days = STUDY_DAYS, startDate = new Date()): DailyRecord[] {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const rows: DailyRecord[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    rows.push({
      dayNumber: i + 1,
      dateISO: toISODate(d),
      shoutCount: null,
      stress: null,
      sleepHours: null,
      studyMinutes: null,
      food: null,
      social: null,
    })
  }
  return rows
}

export function generateStudyRecords(): DailyRecord[] {
  return generateDefaultRecords(STUDY_DAYS, isoToLocalDate(STUDY_START_ISO))
}

export function normalizeRecordsToStudySchedule(input: DailyRecord[] | null): DailyRecord[] {
  const base = generateStudyRecords()
  if (!input || input.length === 0) return base

  const byDay = new Map<number, DailyRecord>()
  for (const r of input) {
    if (typeof r?.dayNumber === 'number') byDay.set(r.dayNumber, r)
  }

  const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const start = isoToLocalDate(STUDY_START_ISO)
  const out: DailyRecord[] = []
  for (let day = 1; day <= STUDY_DAYS; day++) {
    const existing = byDay.get(day)
    const d = new Date(start)
    d.setDate(start.getDate() + (day - 1))

    out.push({
      dayNumber: day,
      dateISO: toISODate(d),
      shoutCount: numOrNull(existing?.shoutCount),
      stress: numOrNull(existing?.stress),
      sleepHours: numOrNull(existing?.sleepHours),
      studyMinutes: numOrNull(existing?.studyMinutes),
      food: numOrNull(existing?.food),
      social: numOrNull(existing?.social),
    })
  }
  return out
}

export function getStudyDayNumber(today = new Date()) {
  const start = isoToLocalDate(STUDY_START_ISO)
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((t.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  return Math.min(STUDY_DAYS, Math.max(1, diffDays + 1))
}

export function loadRecords(): DailyRecord[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed as DailyRecord[]
  } catch {
    return null
  }
}

export function saveRecords(records: DailyRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

