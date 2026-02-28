import type { DailyRecord, DailyScores, ShoutLevel } from './types'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function shoutLevelFromCount(shoutCount: number): ShoutLevel {
  const c = clamp(Math.floor(Number.isFinite(shoutCount) ? shoutCount : 0), 0, 10)
  if (c <= 1) return 'Low'
  if (c <= 3) return 'Minimal'
  if (c <= 6) return 'Moderate'
  if (c <= 8) return 'High'
  return 'Extreme'
}

// Matches the provided scoring tables exactly.
const STRESS_TABLE_1_TO_10 = [1.0, 0.89, 0.78, 0.67, 0.56, 0.44, 0.33, 0.22, 0.11, 0.0] as const
const UP_TABLE_1_TO_10 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const

export function stressScoreFromStress(stress: number) {
  const s = clamp(Math.round(stress), 1, 10)
  return STRESS_TABLE_1_TO_10[s - 1]
}

export function increasingScoreFrom1to10(value: number) {
  const v = clamp(Math.round(value), 1, 10)
  return UP_TABLE_1_TO_10[v - 1]
}

export function sleepScoreFromHours(hours: number) {
  const h = clamp(Number.isFinite(hours) ? hours : 0, 0, 8)
  return clamp(h * 0.125, 0, 1)
}

const STUDY_POINTS: Array<{ m: number; s: number }> = [
  { m: 0, s: 0.0 },
  { m: 30, s: 0.17 },
  { m: 60, s: 0.33 },
  { m: 90, s: 0.5 },
  { m: 120, s: 0.67 },
  { m: 150, s: 0.83 },
  { m: 180, s: 1.0 },
]

export function studyScoreFromMinutes(minutes: number) {
  const m = Math.max(0, Number.isFinite(minutes) ? minutes : 0)
  if (m >= 180) return 1.0

  for (let i = 0; i < STUDY_POINTS.length - 1; i++) {
    const a = STUDY_POINTS[i]!
    const b = STUDY_POINTS[i + 1]!
    if (m >= a.m && m <= b.m) {
      if (b.m === a.m) return b.s
      const t = (m - a.m) / (b.m - a.m)
      return clamp(a.s + t * (b.s - a.s), 0, 1)
    }
  }
  return 0.0
}

export function computeDailyScores(r: DailyRecord): DailyScores {
  const shoutCount = clamp(
    Math.floor(
      typeof r.shoutCount === 'number' && Number.isFinite(r.shoutCount) ? r.shoutCount : 0,
    ),
    0,
    10,
  )
  const shoutLevel = shoutLevelFromCount(shoutCount)

  // If a value is still null (unset), treat its score contribution as 0.
  const stressScore = typeof r.stress === 'number' ? stressScoreFromStress(r.stress) : 0
  const sleepScore = typeof r.sleepHours === 'number' ? sleepScoreFromHours(r.sleepHours) : 0
  const studyScore = typeof r.studyMinutes === 'number' ? studyScoreFromMinutes(r.studyMinutes) : 0
  const foodScore = typeof r.food === 'number' ? increasingScoreFrom1to10(r.food) : 0
  const socialScore = typeof r.social === 'number' ? increasingScoreFrom1to10(r.social) : 0

  const wellBeingScore = clamp(
    stressScore + sleepScore + studyScore + foodScore + socialScore,
    0,
    5,
  )

  return {
    shoutLevel,
    stressScore,
    sleepScore,
    studyScore,
    foodScore,
    socialScore,
    wellBeingScore,
  }
}

