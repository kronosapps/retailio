/**
 * Centralized environment access.
 * Infrastructure and services should read config from here — not scatter
 * `import.meta.env` across the codebase.
 */

function read(key: string): string {
  const value = import.meta.env[key] as string | undefined
  return typeof value === "string" ? value.trim() : ""
}

export const env = {
  /** Vite / app */
  dev: Boolean(import.meta.env.DEV),
  prod: Boolean(import.meta.env.PROD),
  baseUrl: (import.meta.env.BASE_URL as string | undefined) || "/",

  /** Store */
  storeId: read("VITE_STORE_ID") || "store-1",

  /** Firebase */
  firebase: {
    apiKey: read("VITE_FIREBASE_API_KEY"),
    authDomain: read("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: read("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: read("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: read("VITE_FIREBASE_APP_ID"),
    measurementId: read("VITE_FIREBASE_MEASUREMENT_ID"),
  },

  /** Google Apps Script → Sheets (sync only, not source of truth) */
  googleScriptUrl: read("VITE_GOOGLE_SCRIPT_URL"),

  /** Local-auth fallback credentials (used only when Firebase is unset) */
  localAuth: {
    adminEmail: read("VITE_ADMIN_EMAIL") || "admin@retailos.local",
    adminPassword: read("VITE_ADMIN_PASSWORD") || "Admin007",
    adminName: read("VITE_ADMIN_NAME") || "Store Admin",
    cashierEmail: read("VITE_CASHIER_EMAIL") || "cashier@retailos.local",
    cashierPassword: read("VITE_CASHIER_PASSWORD") || "Cashier001",
    cashierName: read("VITE_CASHIER_NAME") || "Front Cashier",
  },
} as const

export const FIREBASE_REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_APP_ID",
] as const

export function getMissingFirebaseEnvKeys(): string[] {
  return FIREBASE_REQUIRED_ENV_KEYS.filter((key) => !read(key))
}

export function isFirebaseEnvConfigured(): boolean {
  return getMissingFirebaseEnvKeys().length === 0
}
