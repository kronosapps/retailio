/**
 * Firebase entrypoint.
 * React and business modules must not import firebase/* SDK directly —
 * use repositories instead. This module only exposes the shared app/db/auth.
 */
export {
  auth,
  db,
  firebaseApp,
  isFirebaseConfigured,
} from "@/lib/firebase"
