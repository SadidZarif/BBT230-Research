import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Unsubscribe,
  type User,
  type UserCredential,
} from 'firebase/auth'
import { getAuthClient } from './firebase'

export const EDITOR_EMAILS = ['samia.ridheeka.251@northsouth.edu'] as const
export const VIEWER_EMAILS = ['muntasir.ali@northsouth.edu', 'unknownflexx@gmail.com'] as const

export type AccessRole = 'editor' | 'viewer' | 'none'

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function isLikelyInAppBrowser() {
  if (typeof navigator === 'undefined') return false
  return /FBAN|FBAV|Instagram|Line|MicroMessenger|Messenger/i.test(navigator.userAgent)
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? ''
}

export function getAccessRole(email: string | null | undefined): AccessRole {
  const normalized = normalizeEmail(email)
  if (!normalized) return 'none'
  if (EDITOR_EMAILS.includes(normalized as (typeof EDITOR_EMAILS)[number])) return 'editor'
  if (VIEWER_EMAILS.includes(normalized as (typeof VIEWER_EMAILS)[number])) return 'viewer'
  return 'none'
}

export function isAllowedEmail(email: string | null | undefined) {
  return getAccessRole(email) !== 'none'
}

export function canEditEmail(email: string | null | undefined) {
  return getAccessRole(email) === 'editor'
}

export function subscribeAuth(onUser: (user: User | null) => void): Unsubscribe {
  const auth = getAuthClient()
  return onAuthStateChanged(auth, onUser)
}

export async function resolveRedirectSignIn() {
  const auth = getAuthClient()
  return getRedirectResult(auth)
}

export async function loginWithGoogle(): Promise<UserCredential | null> {
  const auth = getAuthClient()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    return await signInWithPopup(auth, provider)
  } catch (e) {
    // Redirect can fail on mobile browsers that partition or block storage,
    // so avoid sending those devices to a broken auth helper page.
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      if (isMobileBrowser() || isLikelyInAppBrowser()) {
        throw new Error(
          'Google sign-in was blocked by this mobile browser. Please open this site in Safari or Chrome and try again. If you are already in a normal browser, allow popups and retry.',
        )
      }
      await signInWithRedirect(auth, provider)
      return null
    }
    throw e
  }
}

export async function logout() {
  const auth = getAuthClient()
  await signOut(auth)
}

