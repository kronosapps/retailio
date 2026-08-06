/**
 * Local cache of store settings (Firestore is source of truth when online).
 */

import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"

const STORAGE_KEY = "retailos.store.settings.v1"

type Store = {
  version: 1
  byStoreId: Record<string, StoreSettingsRecord>
}

function empty(): Store {
  return { version: 1, byStoreId: {} }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      version: 1,
      byStoreId:
        parsed.byStoreId && typeof parsed.byStoreId === "object"
          ? parsed.byStoreId
          : {},
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getCachedStoreSettings(
  storeId: string
): StoreSettingsRecord | null {
  return read().byStoreId[storeId] ?? null
}

export function cacheStoreSettings(
  record: StoreSettingsRecord
): StoreSettingsRecord {
  const store = read()
  store.byStoreId[record.storeId] = record
  write(store)
  return record
}

export function defaultStoreSettings(
  storeId: string,
  actorId: string | null = null
): StoreSettingsRecord {
  const now = new Date().toISOString()
  return {
    id: storeId,
    storeId,
    businessName: "",
    whatsappBusinessNumber: "",
    phoneNumberId: "",
    businessLogoUrl: null,
    receiptFooter: "Thank you for shopping with us.",
    supportNumber: "",
    businessAddress: "",
    storeGst: "",
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
  }
}
