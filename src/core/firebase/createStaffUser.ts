import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
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

const SECONDARY_APP_NAME = "retailos-staff-create"

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
    try {
      await deleteApp(secondaryApp)
    } catch {
      // ignore
    }
  }
}
