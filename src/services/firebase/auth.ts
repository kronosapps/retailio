import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
  type Unsubscribe,
} from "firebase/auth"

import { toAppFirebaseError } from "./errors"
import { auth as authInstance, getFirebaseAuth, isFirebaseConfigured } from "./firebase"

/**
 * Firebase Authentication service.
 * Future: Google Login, Phone Login — add methods here without touching React.
 */

/** Nullable Auth instance (null when Firebase env is incomplete). */
export const auth = authInstance

export type LoginCredentials = {
  email: string
  password: string
}

/** Email / password login. Ready to extend with Google / phone providers later. */
export async function login(credentials: LoginCredentials): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(
      getFirebaseAuth(),
      credentials.email.trim(),
      credentials.password
    )
    return result.user
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function logout(): Promise<void> {
  try {
    if (!isFirebaseConfigured) return
    await signOut(getFirebaseAuth())
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export function currentUser(): User | null {
  if (!isFirebaseConfigured) return null
  return getFirebaseAuth().currentUser
}

export function subscribeToAuthChanges(
  callback: (user: User | null) => void
): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), callback)
}

/**
 * Placeholders for future providers — implement without changing call sites.
 * Google: signInWithPopup(auth, new GoogleAuthProvider())
 * Phone: signInWithPhoneNumber(...)
 */
export const AuthProviders = {
  emailPassword: "emailPassword",
  google: "google",
  phone: "phone",
} as const
