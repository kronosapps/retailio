/**
 * Local business-day store (offline-first).
 * One OPEN day per store at a time.
 */

import type { BusinessDayRecord } from "@/modules/dayOps/types"

const STORAGE_KEY = "retailos.business_days.v1"

type DayStore = {
  version: 1
  items: BusinessDayRecord[]
}

function emptyStore(): DayStore {
  return { version: 1, items: [] }
}

function readStore(): DayStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<DayStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      items: parsed.items.map((row) => ({
        ...row,
        sodChecklist: row.sodChecklist ?? null,
        reopenedAt: row.reopenedAt ?? null,
        reopenedBy: row.reopenedBy ?? null,
        reopenedByName: row.reopenedByName ?? null,
        reopenReason: row.reopenReason ?? null,
      })) as BusinessDayRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: DayStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalBusinessDays(): BusinessDayRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.dayKey.localeCompare(a.dayKey)
  )
}

export function getLocalBusinessDay(id: string): BusinessDayRecord | null {
  return readStore().items.find((d) => d.id === id) ?? null
}

export function getLocalBusinessDayByKey(
  dayKey: string,
  storeId: string | null = null
): BusinessDayRecord | null {
  return (
    readStore().items.find((d) => {
      if (d.dayKey !== dayKey) return false
      if (!storeId) return true
      return !d.storeId || d.storeId === storeId
    }) ?? null
  )
}

export function getOpenBusinessDay(
  storeId: string | null = null
): BusinessDayRecord | null {
  return (
    readStore().items.find((d) => {
      if (d.status !== "OPEN") return false
      if (!storeId) return true
      return !d.storeId || d.storeId === storeId
    }) ?? null
  )
}

export function upsertLocalBusinessDay(
  record: BusinessDayRecord
): BusinessDayRecord {
  const store = readStore()
  const index = store.items.findIndex((d) => d.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function replaceLocalBusinessDays(items: BusinessDayRecord[]) {
  writeStore({ version: 1, items })
}
