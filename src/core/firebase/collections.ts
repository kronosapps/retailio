/**
 * Canonical Firestore collection names.
 * Import these constants — never use magic strings for collection paths.
 */
export const COLLECTIONS = {
  PRODUCTS: "products",
  CUSTOMERS: "customers",
  SUPPLIERS: "suppliers",
  PURCHASE_ORDERS: "purchase_orders",
  GOODS_RECEIPTS: "goods_receipts",
  PURCHASE_INVOICES: "purchase_invoices",
  SUPPLIER_PAYMENTS: "supplier_payments",
  PURCHASE_RETURNS: "purchase_returns",
  INVOICES: "invoices",
  PAYMENTS: "payments",
  REFUNDS: "refunds",
  NOTIFICATIONS: "notifications",
  INVENTORY: "inventory",
  INVENTORY_MOVEMENTS: "inventory_movements",
  INVENTORY_LOTS: "inventory_lots",
  STOCK_TAKES: "stock_takes",
  CASHIER_SHIFTS: "cashier_shifts",
  CATEGORIES: "categories",
  EXPENSES: "expenses",
  JOURNAL_ENTRIES: "journal_entries",
  USERS: "users",
  SETTINGS: "settings",
  SYNC_EVENTS: "sync_events",
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
