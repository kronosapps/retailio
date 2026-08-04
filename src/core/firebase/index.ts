/**
 * Core Firebase infrastructure entrypoint.
 * Import from `@/core/firebase` — not from React UI components for business writes
 * (use repositories / modules instead).
 */

export {
  COLLECTIONS,
  type CollectionName,
} from "./collections"

export {
  initializeFirebase,
  isFirebaseConfigured,
  getFirebaseApp,
  getFirestoreDb,
  getFirebaseAuth,
  firebaseApp,
  db,
  auth as firebaseAuthNullable,
} from "./firebase"

export {
  auth,
  login,
  logout,
  currentUser,
  subscribeToAuthChanges,
  AuthProviders,
  type LoginCredentials,
} from "./auth"

export {
  createDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  getCollection,
  queryCollection,
  runTransaction,
  batchWrite,
  upsertDocument,
} from "./firestore"

export {
  AppFirebaseError,
  toAppFirebaseError,
  getFirebaseErrorMessage,
} from "./errors"

export { fetchUserProfile } from "./userProfile"
