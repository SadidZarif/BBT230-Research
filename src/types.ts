export type ShoutLevel = 'Low' | 'Minimal' | 'Moderate' | 'High' | 'Extreme'

export type ISODate = `${number}-${number}-${number}`

export type DailyRecord = {
  dayNumber: number // 1..40 (Day 40 is the most recent)
  dateISO: ISODate
  shoutCount: number | null // 0..10 (we clamp to 10)
  stress: number | null // 1..10
  sleepHours: number | null // 0..8
  studyMinutes: number | null // 0..∞
  food: number | null // 1..10
  social: number | null // 1..10
}

export type DailyScores = {
  shoutLevel: ShoutLevel
  stressScore: number // 0..1
  sleepScore: number // 0..1
  studyScore: number // 0..1
  foodScore: number // 0..1
  socialScore: number // 0..1
  wellBeingScore: number // 0..5
}

export type DailyRow = DailyRecord & DailyScores

