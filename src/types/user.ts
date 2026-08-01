export type UserRole = "admin" | "cashier"

export type UserProfile = {
  email: string
  displayName: string
  role: UserRole
  storeId: string
  createdAt?: { seconds: number; nanoseconds: number }
}
