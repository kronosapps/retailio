import { env } from "@/core/config/env"
import type { UserProfile, UserRole } from "@/types/user"

export type LocalUserRecord = {
  id: string
  email: string
  password: string
  displayName: string
  role: UserRole
  storeId: string
}

const storeId = env.storeId

/**
 * Local staff accounts for login (fallback when Firebase is not configured).
 * Default admin/cashier passwords come from .env / .env.example.
 *
 * To add another cashier, append an object below in this file.
 */
export const LOCAL_USERS: LocalUserRecord[] = [
  {
    id: "local-admin",
    email: env.localAuth.adminEmail,
    password: env.localAuth.adminPassword,
    displayName: env.localAuth.adminName,
    role: "admin",
    storeId,
  },
  {
    id: "local-cashier-001",
    email: env.localAuth.cashierEmail,
    password: env.localAuth.cashierPassword,
    displayName: env.localAuth.cashierName,
    role: "cashier",
    storeId,
  },
  // Example — uncomment / copy to add more cashiers in source:
  // {
  //   id: "local-cashier-002",
  //   email: "cashier2@retailos.local",
  //   password: "Cashier002",
  //   displayName: "Cashier Two",
  //   role: "cashier",
  //   storeId,
  // },
]

export class InvalidLocalCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.")
    this.name = "InvalidLocalCredentialsError"
  }
}

export function findLocalUser(
  email: string,
  password: string
): LocalUserRecord | undefined {
  const normalizedEmail = email.trim().toLowerCase()
  return LOCAL_USERS.find(
    (user) =>
      user.email.toLowerCase() === normalizedEmail && user.password === password
  )
}

export function toUserProfile(user: LocalUserRecord): UserProfile {
  return {
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    storeId: user.storeId,
  }
}
