/**
 * Backup & Recovery — local JSON / Excel snapshots.
 * Google Sheets is NOT a backup target (sync/reporting only).
 */

export const BACKUP_FORMAT_VERSION = 1 as const

export type BackupKind =
  | "database"
  | "products"
  | "customers"
  | "invoices"
  | "inventory"
  | "accounting"
  | "full_business"

export type BackupFormat = "json" | "xlsx"

export type BackupActor = {
  actorId?: string | null
  actorName?: string | null
  storeId?: string | null
  storeName?: string | null
}

export type BackupManifest = {
  formatVersion: typeof BACKUP_FORMAT_VERSION
  kind: BackupKind
  exportedAt: string
  storeId: string | null
  storeName: string | null
  /** Counts per collection / section for quick inspection. */
  counts: Record<string, number>
  notes: string[]
}

/** Full / database JSON envelope. */
export type DatabaseBackupPayload = {
  manifest: BackupManifest
  collections: Record<string, unknown>
  meta: {
    chartOfAccounts: unknown
    excluded: string[]
  }
}

export const BACKUP_KIND_LABELS: Record<BackupKind, string> = {
  database: "Database Backup",
  products: "Product Export",
  customers: "Customer Export",
  invoices: "Invoice Export",
  inventory: "Inventory Export",
  accounting: "Accounting Export",
  full_business: "Full Business Export",
}

export const BACKUP_KIND_DESCRIPTIONS: Record<BackupKind, string> = {
  database:
    "Machine-readable JSON of core Firestore/local collections (source of truth snapshot).",
  products: "Product catalog JSON + Excel for offline archive / re-import prep.",
  customers: "Customer master JSON + Excel.",
  invoices: "Sales invoices (+ linked payments & refunds) JSON + Excel.",
  inventory: "On-hand stock, lots, movements, stock takes — JSON + Excel.",
  accounting: "Posted journals, expenses, CoA metadata — JSON + Excel.",
  full_business:
    "Database JSON plus a multi-sheet workbook covering products, customers, sales, stock, and GL.",
}
