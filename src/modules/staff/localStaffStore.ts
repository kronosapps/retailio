import type { UserRole } from "@/types/user"

import {
  MIN_PASSCODE_LENGTH,
  isValidUsername,
  normalizePasscode,
  normalizeUsername,
  usernameToAuthEmail,
} from "./authIdentity"
import type { CreateStaffInput, StaffListItem, UpdateStaffInput } from "./types"

const STORAGE_KEY = "retailos.staff.local.v1"

export type LocalStaffRecord = {
  id: string
  username: string
  passcode: string
  email: string
  displayName: string
  role: UserRole
  storeId: string
  active: boolean
  createdAt: string
  updatedAt?: string
}

type Store = {
  version: 1
  items: LocalStaffRecord[]
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, items: [] }
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      version: 1,
      items: Array.isArray(parsed.items)
        ? (parsed.items as LocalStaffRecord[])
        : [],
    }
  } catch {
    return { version: 1, items: [] }
  }
}

function writeStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalCreatedStaff(): LocalStaffRecord[] {
  return [...readStore().items]
}

export function getLocalStaffById(id: string): LocalStaffRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function getLocalStaffByUsername(
  username: string
): LocalStaffRecord | null {
  const u = normalizeUsername(username)
  return readStore().items.find((item) => item.username === u) ?? null
}

export function findLocalCreatedStaff(
  username: string,
  passcode: string
): LocalStaffRecord | undefined {
  const u = normalizeUsername(username)
  const p = normalizePasscode(passcode)
  return readStore().items.find(
    (item) => item.active && item.username === u && item.passcode === p
  )
}

export function createLocalStaff(
  input: CreateStaffInput,
  storeId: string
): LocalStaffRecord {
  const username = normalizeUsername(input.username)
  const passcode = normalizePasscode(input.passcode)

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

  const store = readStore()
  if (store.items.some((item) => item.username === username)) {
    throw new Error("That username is already taken.")
  }

  const now = new Date().toISOString()
  const record: LocalStaffRecord = {
    id: `local-staff-${username}`,
    username,
    passcode,
    email: usernameToAuthEmail(username),
    displayName: input.displayName.trim() || username,
    role: input.role,
    storeId: input.storeId?.trim() || storeId,
    active: true,
    createdAt: now,
    updatedAt: now,
  }

  store.items.push(record)
  writeStore(store)
  return record
}

/**
 * Upsert local staff (including overlays for seeded local users).
 */
export function updateLocalStaff(
  input: UpdateStaffInput,
  fallbackStoreId: string
): LocalStaffRecord {
  const store = readStore()
  let idx = store.items.findIndex((item) => item.id === input.id)
  const now = new Date().toISOString()

  const existing = idx >= 0 ? store.items[idx] : null
  const username = normalizeUsername(
    input.username ?? existing?.username ?? ""
  )
  if (!isValidUsername(username)) {
    throw new Error(
      "Username must be 2–32 characters: lowercase letters, numbers, underscore."
    )
  }

  const clash = store.items.find(
    (item) => item.username === username && item.id !== input.id
  )
  if (clash) {
    throw new Error("That username is already taken.")
  }

  const passcodeProvided =
    typeof input.passcode === "string" && input.passcode.length > 0
  const passcode = passcodeProvided
    ? normalizePasscode(input.passcode!)
    : existing?.passcode
  if (passcodeProvided && (passcode?.length ?? 0) < MIN_PASSCODE_LENGTH) {
    throw new Error(
      `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
    )
  }
  if (!passcode) {
    throw new Error("Passcode is required for this staff member.")
  }

  const displayName = (
    input.displayName ??
    existing?.displayName ??
    username
  ).trim()
  if (!displayName) {
    throw new Error("Display name is required.")
  }

  const role = input.role ?? existing?.role
  if (role !== "admin" && role !== "manager" && role !== "cashier") {
    throw new Error("Role must be admin, manager, or cashier.")
  }

  const record: LocalStaffRecord = {
    id: input.id,
    username,
    passcode,
    email: usernameToAuthEmail(username),
    displayName,
    role,
    storeId: existing?.storeId || fallbackStoreId,
    active: input.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  if (idx >= 0) store.items[idx] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

/** Soft-delete: mark inactive (keeps row for history). */
export function softDeleteLocalStaff(id: string): LocalStaffRecord | null {
  const store = readStore()
  const idx = store.items.findIndex((item) => item.id === id)
  if (idx < 0) return null
  const now = new Date().toISOString()
  store.items[idx] = {
    ...store.items[idx],
    active: false,
    updatedAt: now,
  }
  writeStore(store)
  return store.items[idx]
}

/** Hard-remove from local store. */
export function deleteLocalStaff(id: string): boolean {
  const store = readStore()
  const next = store.items.filter((item) => item.id !== id)
  if (next.length === store.items.length) return false
  writeStore({ version: 1, items: next })
  return true
}

export function toStaffListItem(record: LocalStaffRecord): StaffListItem {
  return {
    id: record.id,
    username: record.username,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    storeId: record.storeId,
    active: record.active,
    createdAt: record.createdAt,
  }
}
