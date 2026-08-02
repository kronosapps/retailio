import type { UserProfile, UserRole } from "@/types/user"

export type LocalUserRecord = {
  id: string
  email: string
  password: string
  displayName: string
  role: UserRole
  storeId: string
}

const storeId = import.meta.env.VITE_STORE_ID || "store-1"

/**
 * Local staff accounts for login (no Firebase Auth users).
 * Default admin/cashier passwords come from .env / .env.example.
 *
 * To add another cashier, append an object below in this file.
 */
export const LOCAL_USERS: LocalUserRecord[] = [
  {
    id: "local-admin",
    email: import.meta.env.VITE_ADMIN_EMAIL || "admin@retailos.local",
    password: import.meta.env.VITE_ADMIN_PASSWORD || "Admin007",
    displayName: import.meta.env.VITE_ADMIN_NAME || "Store Admin",
    role: "admin",
    storeId,
  },
  {
    id: "local-cashier-001",
    email: import.meta.env.VITE_CASHIER_EMAIL || "cashier@retailos.local",
    password: import.meta.env.VITE_CASHIER_PASSWORD || "Cashier001",
    displayName: import.meta.env.VITE_CASHIER_NAME || "Front Cashier",
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
