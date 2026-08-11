import { env } from "@/core/config/env"
import {
  findLocalCreatedStaff,
  type LocalStaffRecord,
} from "@/modules/staff/localStaffStore"
import {
  normalizePasscode,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/modules/staff/authIdentity"
import type { UserProfile, UserRole } from "@/types/user"

export type LocalUserRecord = {
  id: string
  username: string
  passcode: string
  email: string
  displayName: string
  role: UserRole
  storeId: string
}

const storeId = env.storeId

/**
 * Seeded local staff (used when Firebase is not configured).
 * Admin can create more cashiers/managers via Staff page → localStaffStore.
 */
export const LOCAL_USERS: LocalUserRecord[] = [
  {
    id: "local-admin",
    username: env.localAuth.adminUsername,
    passcode: env.localAuth.adminPasscode,
    email: usernameToAuthEmail(env.localAuth.adminUsername),
    displayName: env.localAuth.adminName,
    role: "admin",
    storeId,
  },
  {
    id: "local-cashier",
    username: env.localAuth.cashierUsername,
    passcode: env.localAuth.cashierPasscode,
    email: usernameToAuthEmail(env.localAuth.cashierUsername),
    displayName: env.localAuth.cashierName,
    role: "cashier",
    storeId,
  },
  {
    id: "local-manager",
    username: env.localAuth.managerUsername,
    passcode: env.localAuth.managerPasscode,
    email: usernameToAuthEmail(env.localAuth.managerUsername),
    displayName: env.localAuth.managerName,
    role: "manager",
    storeId,
  },
]

export class InvalidLocalCredentialsError extends Error {
  constructor() {
    super("Invalid username or passcode.")
    this.name = "InvalidLocalCredentialsError"
  }
}

function fromCreated(record: LocalStaffRecord): LocalUserRecord {
  return {
    id: record.id,
    username: record.username,
    passcode: record.passcode,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    storeId: record.storeId,
  }
}

export function findLocalUser(
  username: string,
  passcode: string
): LocalUserRecord | undefined {
  const u = normalizeUsername(username)
  const p = normalizePasscode(passcode)

  const seeded = LOCAL_USERS.find(
    (user) => user.username === u && user.passcode === p
  )
  if (seeded) return seeded

  const created = findLocalCreatedStaff(u, p)
  return created ? fromCreated(created) : undefined
}

export function toUserProfile(user: LocalUserRecord): UserProfile {
  return {
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    storeId: user.storeId,
    active: true,
  }
}
