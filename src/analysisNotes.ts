import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore'
import { getDb } from './firebase'

const NOTES_COLLECTION = 'meta'
const NOTES_DOC_ID = 'analysisNotes'

type AnalysisNotesDoc = {
  notes?: Record<string, string>
}

function notesDocRef() {
  return doc(getDb(), NOTES_COLLECTION, NOTES_DOC_ID)
}

export function subscribeAnalysisNotes(
  onNotes: (notes: Record<string, string>) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    notesDocRef(),
    (snap) => {
      const data = snap.data() as AnalysisNotesDoc | undefined
      const rawNotes = data?.notes ?? {}
      const notes = Object.fromEntries(
        Object.entries(rawNotes).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
      onNotes(notes)
    },
    (err) => {
      onError?.(err)
    },
  )
}

export async function updateAnalysisNote(chartId: string, note: string) {
  await setDoc(
    notesDocRef(),
    {
      notes: {
        [chartId]: note,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
