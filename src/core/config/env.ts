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

  /**
   * WhatsApp Business send webhook (Apps Script / Cloud Function / BSP).
   * Never put Meta access tokens in the browser — only a server webhook URL.
   */
  whatsappWebhookUrl: read("VITE_WHATSAPP_WEBHOOK_URL"),

  /** Local-auth fallback credentials (used only when Firebase is unset) */
  localAuth: {
    adminUsername: read("VITE_ADMIN_USERNAME") || "admin",
    adminPasscode: read("VITE_ADMIN_PASSCODE") || "admin123",
    adminName: read("VITE_ADMIN_NAME") || "Store Admin",
    cashierUsername: read("VITE_CASHIER_USERNAME") || "cashier",
    cashierPasscode: read("VITE_CASHIER_PASSCODE") || "cash123",
    cashierName: read("VITE_CASHIER_NAME") || "Sales Cashier",
    managerUsername: read("VITE_MANAGER_USERNAME") || "manager",
    managerPasscode: read("VITE_MANAGER_PASSCODE") || "mgr123",
    managerName: read("VITE_MANAGER_NAME") || "Store Manager",
  },

  /**
   * Banking / GST display + edit unlock (from env — never hardcode in UI).
   * Opening balances are seed defaults when the local banking store is empty.
   */
  banking: {
    passcode:
      read("VITE_BANKING_PASSCODE") ||
      read("VITE_ADMIN_PASSCODE") ||
      "admin123",
    accountName: read("VITE_BANK_ACCOUNT_NAME") || "RetailOS Store Current A/C",
    accountNumber: read("VITE_BANK_ACCOUNT_NUMBER") || "50200012345678",
    ifsc: read("VITE_BANK_IFSC") || "HDFC0001234",
    branch: read("VITE_BANK_BRANCH") || "Main Road Branch",
    bankName: read("VITE_BANK_NAME") || "HDFC Bank",
    upiId: read("VITE_BANK_UPI_ID") || "store@hdfcbank",
    gstin: read("VITE_GSTIN") || "36AAAAA0000A1Z5",
    gstLegalName: read("VITE_GST_LEGAL_NAME") || "RetailOS Traders Pvt Ltd",
    gstTradeName: read("VITE_GST_TRADE_NAME") || "RetailOS Store",
    gstAddress:
      read("VITE_GST_ADDRESS") ||
      "Shop 12, Market Road, Hyderabad, Telangana 500001",
    openingCashRupees: Number.isFinite(
      Number(read("VITE_BANKING_OPENING_CASH_RUPEES") || "5000")
    )
      ? Number(read("VITE_BANKING_OPENING_CASH_RUPEES") || "5000")
      : 5000,
    openingUpiRupees: Number.isFinite(
      Number(read("VITE_BANKING_OPENING_UPI_RUPEES") || "10000")
    )
      ? Number(read("VITE_BANKING_OPENING_UPI_RUPEES") || "10000")
      : 10000,
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
