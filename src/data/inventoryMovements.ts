/**
 * Local inventory movement ledger (offline-first).
 * Explains why current stock is what it is.
 */

import type { InventoryMovement } from "@/modules/inventory/types"

const STORAGE_KEY = "retailos.inventory.movements.v1"

type MovementStore = {
  version: 1
  items: InventoryMovement[]
}

function emptyStore(): MovementStore {
  return { version: 1, items: [] }
}

function readStore(): MovementStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<MovementStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return { version: 1, items: parsed.items as InventoryMovement[] }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: MovementStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalMovements(): InventoryMovement[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalMovement(id: string): InventoryMovement | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalMovementByReference(
  referenceId: string,
  type?: InventoryMovement["type"]
): InventoryMovement | null {
  return (
    readStore().items.find(
      (item) =>
        item.referenceId === referenceId &&
        (type == null || item.type === type)
    ) ?? null
  )
}

export function upsertLocalMovement(
  record: InventoryMovement
): InventoryMovement {
  const store = readStore()
  const index = store.items.findIndex((item) => item.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function listLocalMovementsForSku(sku: string): InventoryMovement[] {
  return listLocalMovements().filter((item) => item.sku === sku)
}

export function replaceLocalMovements(items: InventoryMovement[]) {
  writeStore({ version: 1, items })
}
