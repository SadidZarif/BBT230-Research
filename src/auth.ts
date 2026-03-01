import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth'
import { getAuthClient } from './firebase'

export const ALLOWED_EMAIL = 'samia.ridheeka.251@northsouth.edu'

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) return false
  return email.trim().toLowerCase() === ALLOWED_EMAIL
}

export function subscribeAuth(onUser: (user: User | null) => void): Unsubscribe {
  const auth = getAuthClient()
  return onAuthStateChanged(auth, onUser)
}

export async function loginWithGoogle() {
  const auth = getAuthClient()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    // iOS/Safari often blocks popups; redirect is more reliable there.
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider)
      return
    }
    throw e
  }
}

export async function logout() {
  const auth = getAuthClient()
  await signOut(auth)
}

