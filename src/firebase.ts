import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getAuth, type Auth } from 'firebase/auth'

type FirebaseEnvKey =
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_STORAGE_BUCKET'
  | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
  | 'VITE_FIREBASE_APP_ID'

const REQUIRED_ENV_KEYS: FirebaseEnvKey[] = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

function getMissingFirebaseEnvKeys() {
  const env = import.meta.env as unknown as Record<string, unknown>
  return REQUIRED_ENV_KEYS.filter((k) => {
    const v = env[k]
    return typeof v !== 'string' || v.trim().length === 0
  })
}

let _app: FirebaseApp | null = null
let _db: Firestore | null = null
let _auth: Auth | null = null
let _initError: Error | null = null

function initFirebaseOnce() {
  if (_app || _initError) return

  const missing = getMissingFirebaseEnvKeys()
  if (missing.length > 0) {
    _initError = new Error(`Missing Firebase env: ${missing.join(', ')}`)
    return
  }

  const env = import.meta.env as unknown as Record<string, string>
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }

  _app = initializeApp(firebaseConfig)
}

export function getFirebaseApp(): FirebaseApp {
  initFirebaseOnce()
  if (_app) return _app
  throw _initError ?? new Error('Firebase is not configured')
}

export function getDb(): Firestore {
  initFirebaseOnce()
  if (_db) return _db
  const app = getFirebaseApp()
  _db = getFirestore(app)
  return _db
}

export function getAuthClient(): Auth {
  initFirebaseOnce()
  if (_auth) return _auth
  const app = getFirebaseApp()
  _auth = getAuth(app)
  return _auth
  throw _initError ?? new Error('Firebase is not configured')
}

export function getFirebaseInitErrorMessage(): string | null {
  initFirebaseOnce()
  return _initError?.message ?? null
}

