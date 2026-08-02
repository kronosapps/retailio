export type UserRole = "admin" | "cashier"

/** Local staff profile (from src/data/local-users.ts + .env) */
export type UserProfile = {
  email: string
  displayName: string
  role: UserRole
  storeId: string
  createdAt?: { seconds: number; nanoseconds: number }
}
