/**
 * Append-only CRM audit ledger — punches, points, credit, AR, profile edits.
 */

export type CrmAuditKind =
  | "POINTS_EARNED"
  | "POINTS_REDEEMED"
  | "POINTS_ADJUSTED"
  | "PUNCHES_STAMPED"
  | "PUNCHES_RESET"
  | "PUNCHES_ADJUSTED"
  | "STORE_CREDIT_ISSUED"
  | "STORE_CREDIT_APPLIED"
  | "STORE_CREDIT_VOIDED"
  | "AR_BUMPED"
  | "AR_SETTLED"
  | "AR_ADJUSTED"
  | "CREDIT_NOTE_VOIDED"
  | "CREDIT_NOTE_ADJUSTED"
  | "PROFILE_UPDATED"
  | "MESSAGE_QUEUED"
  | "CAMPAIGN_QUEUED"

export type CrmAuditRecord = {
  id: string
  customerId: string
  customerName: string
  kind: CrmAuditKind
  /** Human summary. */
  message: string
  /** Signed delta when numeric (paisa or points/punches). */
  delta: number | null
  balanceAfter: number | null
  referenceId: string | null
  actorId: string | null
  storeId: string | null
  createdAt: string
}

const STORAGE_KEY = "retailos.crm_audit.v1"

type Store = { version: 1; items: CrmAuditRecord[] }

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
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalCrmAudit(customerId?: string): CrmAuditRecord[] {
  const items = [...read().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
  if (!customerId) return items
  return items.filter((i) => i.customerId === customerId)
}

export function appendLocalCrmAudit(
  record: CrmAuditRecord
): CrmAuditRecord {
  const store = read()
  const idx = store.items.findIndex((i) => i.id === record.id)
  if (idx >= 0) store.items[idx] = record
  else store.items.push(record)
  write({ version: 1, items: store.items.slice(-5000) })
  return record
}

export const CRM_AUDIT_STORAGE_KEY = STORAGE_KEY
