/**
 * Operational Security & Audit — store-wide mutation trail.
 * Answers: who changed price / stock / discount / refund / …
 */

export type OpsAuditKind =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRICE_CHANGED"
  | "STOCK_ADJUSTED"
  | "REFUND"
  | "DISCOUNT_APPLIED"
  | "PROMOTION_CHANGED"
  | "COUPON_CHANGED"
  | "BANKING_OPENING"
  | "BANKING_ADJUSTMENT"
  | "EXPENSE_CREATED"
  | "STAFF_CREATED"
  | "SETTINGS_CHANGED"
  | "BACKUP_EXPORTED"

export type OpsAuditRecord = {
  id: string
  kind: OpsAuditKind
  /** Human one-liner for the inbox / log. */
  message: string
  actorId: string | null
  actorName: string | null
  storeId: string | null
  entityType: string | null
  entityId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  meta: Record<string, unknown>
  sourceEventId: string | null
  sourceEventType: string | null
  createdAt: string
}

export type RecordOpsAuditInput = {
  kind: OpsAuditKind
  message: string
  actorId?: string | null
  actorName?: string | null
  storeId?: string | null
  entityType?: string | null
  entityId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  meta?: Record<string, unknown>
  sourceEventId?: string | null
  sourceEventType?: string | null
  createdAt?: string
}

export const OPS_AUDIT_KIND_LABELS: Record<OpsAuditKind, string> = {
  LOGIN_SUCCESS: "Login",
  LOGIN_FAILED: "Login failed",
  LOGOUT: "Logout",
  PRODUCT_CREATED: "Product created",
  PRODUCT_UPDATED: "Product changed",
  PRICE_CHANGED: "Price changed",
  STOCK_ADJUSTED: "Stock adjusted",
  REFUND: "Refund",
  DISCOUNT_APPLIED: "Discount",
  PROMOTION_CHANGED: "Promotion",
  COUPON_CHANGED: "Coupon",
  BANKING_OPENING: "Banking opening",
  BANKING_ADJUSTMENT: "Banking adjustment",
  EXPENSE_CREATED: "Expense",
  STAFF_CREATED: "Staff created",
  SETTINGS_CHANGED: "Settings",
  BACKUP_EXPORTED: "Backup exported",
}

export const OPS_AUDIT_KINDS = Object.keys(
  OPS_AUDIT_KIND_LABELS
) as OpsAuditKind[]
