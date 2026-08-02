export type UserRole = "admin" | "cashier"

/** Firestore: users/{uid} */
export type UserProfile = {
  email: string
  displayName: string
  role: UserRole
  storeId: string
  createdAt?: { seconds: number; nanoseconds: number }
}
