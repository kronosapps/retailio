/**
 * Local sale-transaction ledger (offline-first integrity trail).
 */

import type { SaleTransactionRecord } from "@/modules/saleTransaction/types"

const STORAGE_KEY = "retailos.sale_transactions.v1"
const MAX_ITEMS = 2000

type Store = { version: 1; items: SaleTransactionRecord[] }

function empty(): Store {
  return { version: 1, items: [] }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      version: 1,
      items: Array.isArray(parsed.items)
        ? (parsed.items as SaleTransactionRecord[])
        : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalSaleTransactions(): SaleTransactionRecord[] {
  return [...read().items].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
}

export function getLocalSaleTransaction(
  id: string
): SaleTransactionRecord | null {
  return read().items.find((i) => i.id === id) ?? null
}

export function getLocalSaleTransactionByInvoice(
  invoiceId: string
): SaleTransactionRecord | null {
  return (
    read().items.find((i) => i.invoiceId === invoiceId) ?? null
  )
}

export function upsertLocalSaleTransaction(
  record: SaleTransactionRecord
): SaleTransactionRecord {
  const store = read()
  const idx = store.items.findIndex((i) => i.id === record.id)
  if (idx >= 0) store.items[idx] = record
  else store.items.unshift(record)
  store.items = store.items.slice(0, MAX_ITEMS)
  write(store)
  return record
}
