import type { UserRole } from "@/types/user"

import {
  MIN_PASSCODE_LENGTH,
  isValidUsername,
  normalizePasscode,
  normalizeUsername,
  usernameToAuthEmail,
} from "./authIdentity"
import type { CreateStaffInput, StaffListItem } from "./types"

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

export function findLocalCreatedStaff(
  username: string,
  passcode: string
): LocalStaffRecord | undefined {
  const u = normalizeUsername(username)
  const p = normalizePasscode(passcode)
  return readStore().items.find(
    (item) =>
      item.active &&
      item.username === u &&
      item.passcode === p
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
    throw new Error(`Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`)
  }

  const store = readStore()
  if (store.items.some((item) => item.username === username)) {
    throw new Error("That username is already taken.")
  }

  const record: LocalStaffRecord = {
    id: `local-staff-${username}`,
    username,
    passcode,
    email: usernameToAuthEmail(username),
    displayName: input.displayName.trim() || username,
    role: input.role,
    storeId: input.storeId?.trim() || storeId,
    active: true,
    createdAt: new Date().toISOString(),
  }

  store.items.push(record)
  writeStore(store)
  return record
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
