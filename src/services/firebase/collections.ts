/**
 * Canonical Firestore collection names.
 * Import these constants — never use magic strings for collection paths.
 */
export const COLLECTIONS = {
  PRODUCTS: "products",
  CUSTOMERS: "customers",
  SUPPLIERS: "suppliers",
  INVOICES: "invoices",
  PAYMENTS: "payments",
  INVENTORY: "inventory",
  EXPENSES: "expenses",
  USERS: "users",
  SETTINGS: "settings",
  SYNC_EVENTS: "sync_events",
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
