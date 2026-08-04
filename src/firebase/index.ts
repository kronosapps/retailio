/**
 * Legacy path `@/firebase`.
 * Prefer `@/services/firebase` for new modules.
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
  COLLECTIONS,
  login,
  logout,
  currentUser,
  AppFirebaseError,
  getFirebaseErrorMessage,
} from "@/services/firebase"
