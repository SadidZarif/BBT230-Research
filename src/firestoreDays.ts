import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { DailyRecord } from './types'
import { generateStudyRecords, STUDY_DAYS } from './storage'

const DAYS_COLLECTION = 'days'

function dayDocId(dayNumber: number) {
  return String(dayNumber)
}

export async function ensureSeededDays() {
  const db = getDb()
  const colRef = collection(db, DAYS_COLLECTION)
  const countSnap = await getCountFromServer(colRef)
  if (countSnap.data().count > 0) return

  const base = generateStudyRecords()
  const batch = writeBatch(db)
  for (const r of base) {
    batch.set(doc(db, DAYS_COLLECTION, dayDocId(r.dayNumber)), { ...r, updatedAt: serverTimestamp() })
  }
  await batch.commit()
}

export function subscribeDays(
  onRecords: (records: DailyRecord[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const db = getDb()
  const colRef = collection(db, DAYS_COLLECTION)
  return onSnapshot(
    colRef,
    (snap) => {
      const base = generateStudyRecords()
      const byDay = new Map<number, DailyRecord>(base.map((r) => [r.dayNumber, r]))

      for (const d of snap.docs) {
        const data = d.data() as Partial<DailyRecord>
        const dayNumber = Number(data.dayNumber ?? d.id)
        if (!Number.isFinite(dayNumber)) continue
        if (dayNumber < 1 || dayNumber > STUDY_DAYS) continue

        const prev = byDay.get(dayNumber)
        if (!prev) continue
        byDay.set(dayNumber, {
          ...prev,
          ...data,
          dayNumber,
        } as DailyRecord)
      }

      const out = Array.from(byDay.values()).sort((a, b) => a.dayNumber - b.dayNumber)
      onRecords(out)
    },
    (err) => {
      onError?.(err)
    },
  )
}

export async function updateDay(dayNumber: number, patch: Partial<DailyRecord>) {
  const db = getDb()
  await setDoc(
    doc(db, DAYS_COLLECTION, dayDocId(dayNumber)),
    { ...patch, dayNumber, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

