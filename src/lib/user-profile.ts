import type { UserProfile, UserRole } from "@/types/user"

const ROLES: UserRole[] = ["admin", "cashier"]

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLES.includes(value as UserRole)
}

export function parseUserProfile(data: unknown): UserProfile | null {
  if (!data || typeof data !== "object") return null

  const record = data as Record<string, unknown>
  const email = record.email
  const displayName = record.displayName
  const role = record.role
  const storeId = record.storeId

  if (typeof email !== "string" || !email) return null
  if (typeof displayName !== "string" || !displayName) return null
  if (!isUserRole(role)) return null
  if (typeof storeId !== "string" || !storeId) return null

  const profile: UserProfile = {
    email,
    displayName,
    role,
    storeId,
  }

  const createdAt = record.createdAt
  if (
    createdAt &&
    typeof createdAt === "object" &&
    "seconds" in createdAt &&
    "nanoseconds" in createdAt &&
    typeof (createdAt as { seconds: unknown }).seconds === "number" &&
    typeof (createdAt as { nanoseconds: unknown }).nanoseconds === "number"
  ) {
    profile.createdAt = {
      seconds: (createdAt as { seconds: number }).seconds,
      nanoseconds: (createdAt as { nanoseconds: number }).nanoseconds,
    }
  }

  return profile
}

export class MissingStoreProfileError extends Error {
  constructor() {
    super(
      "No store profile found for this account. Create a Firestore users/{uid} document with role admin or cashier."
    )
    this.name = "MissingStoreProfileError"
  }
}
