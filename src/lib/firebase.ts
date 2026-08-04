/**
 * Backward-compatible re-export.
 * All Firebase initialization lives in `@/services/firebase`.
 * Prefer importing from `@/services/firebase` in new code.
 */
export {
  auth,
  db,
  firebaseApp,
  isFirebaseConfigured,
  getFirebaseApp,
  getFirestoreDb,
  getFirebaseAuth,
  initializeFirebase,
} from "@/services/firebase/firebase"

// Re-export Auth instance used by legacy soft-null checks
export { auth as firebaseAuth } from "@/services/firebase/firebase"
