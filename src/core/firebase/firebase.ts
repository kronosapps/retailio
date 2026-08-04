import { initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

import {
  env,
  getMissingFirebaseEnvKeys,
  isFirebaseEnvConfigured,
} from "@/core/config/env"

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

function readFirebaseConfig(): FirebaseEnvConfig | null {
  if (!isFirebaseEnvConfigured()) return null

  const { firebase } = env
  return {
    apiKey: firebase.apiKey,
    authDomain: firebase.authDomain,
    projectId: firebase.projectId,
    storageBucket: firebase.storageBucket,
    messagingSenderId: firebase.messagingSenderId,
    appId: firebase.appId,
    measurementId: firebase.measurementId || undefined,
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
    const missing = getMissingFirebaseEnvKeys()
    throw new AppFirebaseError(
      "firebase/not-configured",
      `Firebase configuration is incomplete. Missing: ${missing.join(", ")}. Copy values from .env.example into .env.`
    )
  }

  if (!app) {
    app = initializeApp(config)
    firestoreDb = getFirestore(app)
    authInstance = getAuth(app)

    if (env.dev) {
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
    if (env.dev) {
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
