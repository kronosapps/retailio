/**
 * Append-only operational audit ledger (store security trail).
 * Separate from CRM customer audit (`crm_audit`).
 */

import type { OpsAuditRecord } from "@/modules/audit/types"

const STORAGE_KEY = "retailos.ops_audit.v1"
const MAX_ITEMS = 5000

type Store = { version: 1; items: OpsAuditRecord[] }

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
      items: Array.isArray(parsed.items) ? (parsed.items as OpsAuditRecord[]) : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalOpsAudit(): OpsAuditRecord[] {
  return [...read().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function appendLocalOpsAudit(record: OpsAuditRecord): OpsAuditRecord {
  const store = read()
  const idx = store.items.findIndex((i) => i.id === record.id)
  if (idx >= 0) store.items[idx] = record
  else store.items.unshift(record)
  store.items = store.items.slice(0, MAX_ITEMS)
  write(store)
  return record
}

export function getLocalOpsAudit(id: string): OpsAuditRecord | null {
  return read().items.find((i) => i.id === id) ?? null
}
