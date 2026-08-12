import { env } from "@/core/config/env"
import {
  createFirebaseStaffUser,
  currentUser,
  getCollection,
  isFirebaseConfigured,
  COLLECTIONS,
  AppFirebaseError,
} from "@/core/firebase"
import { LOCAL_USERS } from "@/data/local-users"
import type { UserRole } from "@/types/user"

import {
  MIN_PASSCODE_LENGTH,
  isValidUsername,
  normalizePasscode,
  normalizeUsername,
  usernameFromAuthEmail,
  usernameToAuthEmail,
} from "./authIdentity"
import {
  createLocalStaff,
  listLocalCreatedStaff,
  toStaffListItem,
} from "./localStaffStore"
import { AuditService } from "@/modules/audit"
import type {
  CreateStaffInput,
  CreateStaffResult,
  StaffListItem,
} from "./types"

type UserDoc = {
  id: string
  email?: string
  username?: string
  displayName?: string
  role?: string
  storeId?: string
  active?: boolean
  createdAt?: string
}

function toListItem(doc: UserDoc): StaffListItem | null {
  const email = typeof doc.email === "string" ? doc.email : ""
  const username =
    typeof doc.username === "string" && doc.username
      ? doc.username
      : usernameFromAuthEmail(email)
  const role = doc.role
  if (role !== "admin" && role !== "manager" && role !== "cashier") {
    return null
  }
  return {
    id: doc.id,
    username,
    email,
    displayName:
      typeof doc.displayName === "string" && doc.displayName
        ? doc.displayName
        : username,
    role: role as UserRole,
    storeId: typeof doc.storeId === "string" ? doc.storeId : env.storeId,
    active: doc.active !== false,
    createdAt: typeof doc.createdAt === "string" ? doc.createdAt : null,
  }
}

/**
 * Staff identity module — create/list staff accounts.
 * Firebase Spark: secondary Auth app + Firestore (admin rules).
 * Local mode: seeded users + localStorage.
 * EOD reporting stays in reports/sync; cash accountability is ShiftService / TillEngine.
 */
export class StaffService {
  static async list(): Promise<StaffListItem[]> {
    if (isFirebaseConfigured) {
      const rows = await getCollection<UserDoc>(COLLECTIONS.USERS)
      return rows
        .map((row) => toListItem(row))
        .filter((item): item is StaffListItem => Boolean(item))
        .sort((a, b) => a.username.localeCompare(b.username))
    }

    const seeded: StaffListItem[] = LOCAL_USERS.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      storeId: user.storeId,
      active: true,
      createdAt: null,
    }))
    const created = listLocalCreatedStaff().map(toStaffListItem)
    const byUsername = new Map<string, StaffListItem>()
    for (const item of [...seeded, ...created]) {
      byUsername.set(item.username, item)
    }
    return [...byUsername.values()].sort((a, b) =>
      a.username.localeCompare(b.username)
    )
  }

  static async create(input: CreateStaffInput): Promise<CreateStaffResult> {
    const username = normalizeUsername(input.username)
    const passcode = normalizePasscode(input.passcode)
    const displayName = input.displayName.trim()

    if (!isValidUsername(username)) {
      throw new Error(
        "Username must be 2–32 characters: lowercase letters, numbers, underscore."
      )
    }
    if (passcode.length < MIN_PASSCODE_LENGTH) {
      throw new Error(
        `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
      )
    }
    if (!displayName) {
      throw new Error("Display name is required.")
    }

    if (isFirebaseConfigured) {
      const existing = await this.list()
      if (existing.some((item) => item.username === username)) {
        throw new AppFirebaseError(
          "auth/email-already-exists",
          "That username is already taken."
        )
      }

      const createdBy = currentUser()?.uid ?? null
      const result = await createFirebaseStaffUser({
        username,
        email: usernameToAuthEmail(username),
        passcode,
        displayName,
        role: input.role,
        storeId: input.storeId?.trim() || env.storeId,
        createdBy,
      })
      void AuditService.record({
        kind: "STAFF_CREATED",
        message: `Staff created · ${displayName} (@${username}) · ${input.role}`,
        actorId: createdBy,
        storeId: input.storeId?.trim() || env.storeId,
        entityType: "user",
        entityId: result.id,
        after: { username, role: input.role, displayName },
      })
      return result
    }

    if (LOCAL_USERS.some((u) => u.username === username)) {
      throw new Error("That username is already taken.")
    }

    const record = createLocalStaff(
      { ...input, username, passcode, displayName },
      env.storeId
    )
    void AuditService.record({
      kind: "STAFF_CREATED",
      message: `Staff created · ${displayName} (@${username}) · ${input.role}`,
      actorId: null,
      storeId: env.storeId,
      entityType: "user",
      entityId: record.id,
      after: { username, role: input.role, displayName },
    })
    return {
      id: record.id,
      username: record.username,
      email: record.email,
      role: record.role,
    }
  }
}
