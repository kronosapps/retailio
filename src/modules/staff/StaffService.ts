import { env } from "@/core/config/env"
import {
  createFirebaseStaffUser,
  updateFirebaseStaffAuth,
  currentUser,
  getCollection,
  isFirebaseConfigured,
  COLLECTIONS,
  AppFirebaseError,
  upsertDocument,
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
  deleteLocalStaff,
  getLocalStaffById,
  listLocalCreatedStaff,
  softDeleteLocalStaff,
  toStaffListItem,
  updateLocalStaff,
} from "./localStaffStore"
import { AuditService } from "@/modules/audit"
import type {
  CreateStaffInput,
  CreateStaffResult,
  StaffListItem,
  UpdateStaffInput,
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

function assertNotSelf(id: string) {
  const uid = currentUser()?.uid
  if (uid && uid === id) {
    throw new Error("You cannot edit or delete your own staff account here.")
  }
  // Local session id
  try {
    const raw = localStorage.getItem("retailos.auth.local")
    if (raw) {
      const parsed = JSON.parse(raw) as { userId?: string }
      if (parsed.userId && parsed.userId === id) {
        throw new Error(
          "You cannot edit or delete your own staff account here."
        )
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("own staff")) throw err
  }
}

/**
 * Staff identity module — create / list / update / delete.
 * Firebase: Auth mutations via Cloud Functions; profile-only via Firestore.
 * Local mode: localStorage overlays (including seeded users).
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
    const byId = new Map<string, StaffListItem>()
    for (const item of seeded) byId.set(item.id, item)
    // Local overlays / creates win (same id or same username)
    for (const item of created) {
      byId.set(item.id, item)
      for (const [id, row] of byId) {
        if (id !== item.id && row.username === item.username) {
          byId.delete(id)
        }
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.username.localeCompare(b.username)
    )
  }

  static async getById(id: string): Promise<StaffListItem | null> {
    const rows = await this.list()
    return rows.find((r) => r.id === id) ?? null
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

  static async update(input: UpdateStaffInput): Promise<StaffListItem> {
    assertNotSelf(input.id)
    const before = await this.getById(input.id)
    if (!before) {
      throw new Error("Staff member not found.")
    }

    const username =
      input.username !== undefined
        ? normalizeUsername(input.username)
        : before.username
    if (!isValidUsername(username)) {
      throw new Error(
        "Username must be 2–32 characters: lowercase letters, numbers, underscore."
      )
    }

    const displayName =
      input.displayName !== undefined
        ? input.displayName.trim()
        : before.displayName
    if (!displayName) {
      throw new Error("Display name is required.")
    }

    const role = input.role ?? before.role
    const active = input.active ?? before.active
    const passcodeProvided =
      typeof input.passcode === "string" && input.passcode.length > 0
    if (passcodeProvided) {
      const passcode = normalizePasscode(input.passcode!)
      if (passcode.length < MIN_PASSCODE_LENGTH) {
        throw new Error(
          `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
        )
      }
    }

    if (isFirebaseConfigured) {
      const usernameChanged = username !== before.username
      const needsAuth = usernameChanged || passcodeProvided

      if (needsAuth) {
        const currentPasscode = normalizePasscode(
          input.currentPasscode || ""
        )
        if (!currentPasscode) {
          throw new Error(
            "Enter the staff member’s current passcode to change username or passcode (Spark / no Cloud Functions)."
          )
        }
        const existing = await this.list()
        if (
          usernameChanged &&
          existing.some((s) => s.username === username && s.id !== input.id)
        ) {
          throw new Error("That username is already taken.")
        }
        const email = usernameToAuthEmail(username)
        await updateFirebaseStaffAuth({
          id: input.id,
          currentEmail: before.email || usernameToAuthEmail(before.username),
          currentPasscode,
          username,
          email,
          displayName,
          newPasscode: passcodeProvided
            ? normalizePasscode(input.passcode!)
            : null,
        })
      }

      const now = new Date().toISOString()
      await upsertDocument(COLLECTIONS.USERS, input.id, {
        id: input.id,
        email: usernameToAuthEmail(username),
        username,
        displayName,
        role,
        active,
        storeId: before.storeId,
        updatedAt: now,
        updatedBy: currentUser()?.uid ?? null,
      })

      const after = (await this.getById(input.id)) || {
        ...before,
        username,
        displayName,
        role,
        active,
        email: usernameToAuthEmail(username),
      }
      void AuditService.record({
        kind: "STAFF_UPDATED",
        message: `Staff updated · ${displayName} (@${username}) · ${role}`,
        actorId: currentUser()?.uid ?? null,
        storeId: before.storeId,
        entityType: "user",
        entityId: input.id,
        before: {
          username: before.username,
          displayName: before.displayName,
          role: before.role,
          active: before.active,
        },
        after: {
          username: after.username,
          displayName: after.displayName,
          role: after.role,
          active: after.active,
        },
      })
      return after
    }

    // Local: ensure seeded users get an overlay record
    if (!getLocalStaffById(input.id)) {
      const seeded = LOCAL_USERS.find((u) => u.id === input.id)
      if (seeded) {
        updateLocalStaff(
          {
            id: seeded.id,
            username: seeded.username,
            passcode: seeded.passcode,
            displayName: seeded.displayName,
            role: seeded.role,
            active: true,
          },
          env.storeId
        )
      }
    }

    const record = updateLocalStaff(
      {
        id: input.id,
        username,
        displayName,
        role,
        active,
        passcode: passcodeProvided ? input.passcode : undefined,
      },
      env.storeId
    )
    void AuditService.record({
      kind: "STAFF_UPDATED",
      message: `Staff updated · ${record.displayName} (@${record.username}) · ${record.role}`,
      actorId: null,
      storeId: record.storeId,
      entityType: "user",
      entityId: record.id,
      before: before
        ? {
            username: before.username,
            displayName: before.displayName,
            role: before.role,
            active: before.active,
          }
        : null,
      after: {
        username: record.username,
        displayName: record.displayName,
        role: record.role,
        active: record.active,
      },
    })
    return toStaffListItem(record)
  }

  static async remove(
    id: string,
    options?: { hard?: boolean }
  ): Promise<void> {
    assertNotSelf(id)
    const before = await this.getById(id)
    if (!before) {
      throw new Error("Staff member not found.")
    }

    if (isFirebaseConfigured) {
      // Spark-friendly soft-delete: block login via users/{id}.active = false.
      // Auth user remains (no Admin SDK on Spark) but cannot get a store profile.
      await upsertDocument(COLLECTIONS.USERS, id, {
        id,
        active: false,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser()?.uid ?? null,
      })
    } else {
      if (!getLocalStaffById(id)) {
        const seeded = LOCAL_USERS.find((u) => u.id === id)
        if (seeded) {
          updateLocalStaff(
            {
              id: seeded.id,
              username: seeded.username,
              passcode: seeded.passcode,
              displayName: seeded.displayName,
              role: seeded.role,
              active: true,
            },
            env.storeId
          )
        }
      }
      if (options?.hard) {
        deleteLocalStaff(id)
      } else {
        softDeleteLocalStaff(id)
      }
    }

    void AuditService.record({
      kind: "STAFF_DELETED",
      message: `Staff deleted · ${before.displayName} (@${before.username})`,
      actorId: currentUser()?.uid ?? null,
      storeId: before.storeId,
      entityType: "user",
      entityId: id,
      before: {
        username: before.username,
        displayName: before.displayName,
        role: before.role,
        active: before.active,
      },
      meta: { hard: Boolean(options?.hard), sparkSoftDelete: true },
    })
  }
}
