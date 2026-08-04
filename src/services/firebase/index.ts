/**
 * Single entrypoint for Firebase access.
 * Other modules should import only from `@/services/firebase`.
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
