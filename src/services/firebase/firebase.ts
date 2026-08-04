import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

import { AppFirebaseError } from "./errors"

type FirebaseEnvConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

const REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_APP_ID",
] as const

function readFirebaseConfig(): FirebaseEnvConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as
    | string
    | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as
    | string
    | undefined
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    | string
    | undefined
  const messagingSenderId = import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as
    | string
    | undefined

  const missing = REQUIRED_ENV_KEYS.filter((key) => {
    const value = import.meta.env[key] as string | undefined
    return !value || !String(value).trim()
  })

  if (missing.length > 0) {
    return null
  }

  return {
    apiKey: apiKey!.trim(),
    authDomain: authDomain!.trim(),
    projectId: projectId!.trim(),
    storageBucket: (storageBucket || "").trim(),
    messagingSenderId: (messagingSenderId || "").trim(),
    appId: appId!.trim(),
    measurementId: measurementId?.trim() || undefined,
  }
}

const config = readFirebaseConfig()

/** True when all required VITE_FIREBASE_* variables are present. */
export const isFirebaseConfigured = Boolean(config)

let app: FirebaseApp | null = null
let firestoreDb: Firestore | null = null
let authInstance: Auth | null = null

/**
 * Initialize Firebase exactly once.
 * Safe to call multiple times — subsequent calls return the same instances.
 */
export function initializeFirebase(): {
  app: FirebaseApp
  db: Firestore
  auth: Auth
} {
  if (!config) {
    const missing = REQUIRED_ENV_KEYS.filter((key) => {
      const value = import.meta.env[key] as string | undefined
      return !value || !String(value).trim()
    })
    throw new AppFirebaseError(
      "firebase/not-configured",
      `Firebase configuration is incomplete. Missing: ${missing.join(", ")}. Copy values from .env.example into .env.`
    )
  }

  if (!app) {
    app = initializeApp(config)
    firestoreDb = getFirestore(app)
    authInstance = getAuth(app)

    if (import.meta.env.DEV) {
      console.info(
        `[RetailOS] Firebase initialized (project: ${config.projectId})`
      )
    }
  }

  return {
    app,
    db: firestoreDb!,
    auth: authInstance!,
  }
}

if (isFirebaseConfigured) {
  try {
    initializeFirebase()
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[RetailOS] Firebase failed to initialize", error)
    }
  }
}

/** Nullable exports for soft feature detection (offline / local-auth mode). */
export const firebaseApp: FirebaseApp | null = app
export const db: Firestore | null = firestoreDb
export const auth: Auth | null = authInstance

/** Strict accessors — throw descriptive errors when Firebase is unavailable. */
export function getFirebaseApp(): FirebaseApp {
  if (!app) initializeFirebase()
  return app!
}

export function getFirestoreDb(): Firestore {
  if (!firestoreDb) initializeFirebase()
  return firestoreDb!
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) initializeFirebase()
  return authInstance!
}
