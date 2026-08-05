/**
 * Local inventory persistence (offline-first).
 * Firestore + Sheets sync happens via InventoryRepository after writes.
 */

export type InventoryRecord = {
  id: string
  productId: string
  sku?: string
  name: string
  quantity: number
  unit: string
  category?: string
  notes?: string
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

const STORAGE_KEY = "retailos.inventory.v1"

export type CreateInventoryInput = {
  name: string
  quantity: number
  unit?: string
  sku?: string
  category?: string
  notes?: string
  productId?: string
  storeId?: string | null
  createdBy?: string | null
}

type InventoryStore = {
  version: 1
  items: InventoryRecord[]
  seeded: boolean
}

/** Three starter stock lines for a sweets / halwa kitchen. */
export const SAMPLE_INVENTORY: Omit<
  InventoryRecord,
  "storeId" | "createdBy" | "updatedBy" | "createdAt" | "updatedAt"
>[] = [
  {
    id: "inv_sample_jaggery",
    productId: "raw-jaggery",
    sku: "RAW-JAG-25",
    name: "Jaggery (Bellam)",
    quantity: 50,
    unit: "kg",
    category: "Ingredients",
    notes: "Used for Bellam Halwa batches",
  },
  {
    id: "inv_sample_cashew",
    productId: "raw-cashew",
    sku: "RAW-CASH-10",
    name: "Cashew nuts",
    quantity: 20,
    unit: "kg",
    category: "Ingredients",
    notes: "For Multi Nuts Halwa and garnishing",
  },
  {
    id: "inv_sample_ghee",
    productId: "raw-ghee",
    sku: "RAW-GHEE-15",
    name: "Pure ghee",
    quantity: 30,
    unit: "L",
    category: "Ingredients",
    notes: "Kitchen frying and finishing",
  },
]

function emptyStore(): InventoryStore {
  return { version: 1, items: [], seeded: false }
}

function readStore(): InventoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<InventoryStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      items: parsed.items as InventoryRecord[],
      seeded: Boolean(parsed.seeded),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: InventoryStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

export function listLocalInventory(): InventoryRecord[] {
  return [...readStore().items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
}

export function getLocalInventory(id: string): InventoryRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function isInventorySeeded(): boolean {
  return readStore().seeded || readStore().items.length > 0
}

export function markInventorySeeded() {
  const store = readStore()
  store.seeded = true
  writeStore(store)
}

export function upsertLocalInventory(record: InventoryRecord): InventoryRecord {
  const store = readStore()
  const index = store.items.findIndex((item) => item.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function deleteLocalInventory(id: string): InventoryRecord | null {
  const store = readStore()
  const existing = store.items.find((item) => item.id === id) ?? null
  if (!existing) return null
  store.items = store.items.filter((item) => item.id !== id)
  writeStore(store)
  return existing
}

export function buildInventoryRecord(
  input: CreateInventoryInput,
  id: string
): InventoryRecord {
  const now = new Date().toISOString()
  const name = input.name.trim()
  const productId =
    input.productId?.trim() || slugify(name) || `product-${id}`

  return {
    id,
    productId,
    sku: input.sku?.trim() || undefined,
    name,
    quantity: Number.isFinite(input.quantity) ? input.quantity : 0,
    unit: (input.unit?.trim() || "pcs").slice(0, 24),
    category: input.category?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    storeId: input.storeId ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
  }
}

export function buildSampleRecords(
  storeId: string | null,
  createdBy: string | null
): InventoryRecord[] {
  const now = new Date().toISOString()
  return SAMPLE_INVENTORY.map((sample) => ({
    ...sample,
    storeId,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  }))
}
