export type UserRole = "admin" | "manager" | "cashier"

/** Staff profile from Firestore users/{uid} or local auth. */
export type UserProfile = {
  /** Auth email (may be synthetic `{username}@retailos.local`). */
  email: string
  /** Login username (preferred identity for staff). */
  username: string
  displayName: string
  role: UserRole
  storeId: string
  active?: boolean
  createdAt?: { seconds: number; nanoseconds: number }
}
