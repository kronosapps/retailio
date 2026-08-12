import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { deleteApp, getApp, initializeApp, type FirebaseApp } from "firebase/app"

import { env } from "@/core/config/env"
import type { UserRole } from "@/types/user"

import { COLLECTIONS } from "./collections"
import { AppFirebaseError, toAppFirebaseError } from "./errors"
import {
  getFirestoreDb,
  initializeFirebase,
  isFirebaseConfigured,
} from "./firebase"

const SECONDARY_APP_NAME = "retailos-staff-admin"

function getOrInitSecondaryApp(): FirebaseApp {
  try {
    return getApp(SECONDARY_APP_NAME)
  } catch {
    initializeFirebase()
    return initializeApp(
      {
        apiKey: env.firebase.apiKey,
        authDomain: env.firebase.authDomain,
        projectId: env.firebase.projectId,
        storageBucket: env.firebase.storageBucket,
        messagingSenderId: env.firebase.messagingSenderId,
        appId: env.firebase.appId,
      },
      SECONDARY_APP_NAME
    )
  }
}

async function disposeSecondaryApp(app: FirebaseApp) {
  try {
    await deleteApp(app)
  } catch {
    // ignore
  }
}

export type CreateFirebaseStaffInput = {
  username: string
  email: string
  passcode: string
  displayName: string
  role: UserRole
  storeId: string
  createdBy: string | null
}

/**
 * Create Auth user + users/{uid} without changing the signed-in admin session.
 * Uses a secondary Firebase App (works on Spark — no Cloud Functions).
 */
export async function createFirebaseStaffUser(
  input: CreateFirebaseStaffInput
): Promise<{ id: string; email: string; username: string; role: UserRole }> {
  if (!isFirebaseConfigured) {
    throw new AppFirebaseError(
      "firebase/not-configured",
      "Firebase is not configured."
    )
  }

  const secondaryApp = getOrInitSecondaryApp()
  const secondaryAuth = getAuth(secondaryApp)
  const now = new Date().toISOString()

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      input.email,
      input.passcode
    )
    const uid = credential.user.uid

    try {
      await setDoc(doc(getFirestoreDb(), COLLECTIONS.USERS, uid), {
        id: uid,
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        storeId: input.storeId,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })
    } catch (profileError) {
      await deleteUser(credential.user).catch(() => undefined)
      throw profileError
    }

    await signOut(secondaryAuth)

    return {
      id: uid,
      email: input.email,
      username: input.username,
      role: input.role,
    }
  } catch (error) {
    if (secondaryAuth.currentUser) {
      await signOut(secondaryAuth).catch(() => undefined)
    }
    throw toAppFirebaseError(error)
  } finally {
    await disposeSecondaryApp(secondaryApp)
  }
}

export type UpdateFirebaseStaffAuthInput = {
  id: string
  /** Current login email (from profile). */
  currentEmail: string
  /** Required to change username or passcode on Spark (no Admin SDK). */
  currentPasscode: string
  username: string
  email: string
  displayName: string
  /** When set, replaces Auth password. */
  newPasscode?: string | null
}

/**
 * Update another staff Auth user on Spark by signing into a secondary app
 * with their current passcode (no Cloud Functions / Blaze).
 */
export async function updateFirebaseStaffAuth(
  input: UpdateFirebaseStaffAuthInput
): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new AppFirebaseError(
      "firebase/not-configured",
      "Firebase is not configured."
    )
  }

  const secondaryApp = getOrInitSecondaryApp()
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const credential = await signInWithEmailAndPassword(
      secondaryAuth,
      input.currentEmail,
      input.currentPasscode
    )
    if (credential.user.uid !== input.id) {
      await signOut(secondaryAuth)
      throw new AppFirebaseError(
        "auth/uid-mismatch",
        "Current passcode does not match this staff account."
      )
    }

    await updateProfile(credential.user, { displayName: input.displayName })

    if (input.email !== input.currentEmail) {
      await updateEmail(credential.user, input.email)
    }

    if (input.newPasscode) {
      await updatePassword(credential.user, input.newPasscode)
    }

    await signOut(secondaryAuth)
  } catch (error) {
    if (secondaryAuth.currentUser) {
      await signOut(secondaryAuth).catch(() => undefined)
    }
    throw toAppFirebaseError(error)
  } finally {
    await disposeSecondaryApp(secondaryApp)
  }
}
