import type { UserRole } from "@/types/user"

export type UtilityGroupId =
  | "setup"
  | "master-data"
  | "daily"
  | "accounting"
  | "analysis"
  | "statutory"

export type UtilityToolId =
  | "business-setup"
  | "financial-year"
  | "barcode"
  | "recycle-bin"
  | "master-data"
  | "master-brands"
  | "master-units"
  | "master-tax-rates"
  | "master-payment-methods"
  | "daybook"
  | "all-transactions"
  | "accounting"
  | "chart-of-accounts"
  | "manual-journal"
  | "trial-balance"
  | "profit-loss"
  | "balance-sheet"
  | "cash-flow"
  | "account-statement"
  | "report-item"
  | "report-operator"
  | "report-role"
  | "report-expense"
  | "expense-create"
  | "erp-chain"
  | "audit-log"
  | "sync-center"
  | "pricing"
  | "gst"
  | "tcs"
  | "form-27eq"

export type UtilityTool = {
  id: UtilityToolId
  group: UtilityGroupId
  title: string
  description: string
  path: string
  roles: UserRole[]
}

export const UTILITY_GROUPS: {
  id: UtilityGroupId
  title: string
}[] = [
  { id: "setup", title: "Business & Setup" },
  { id: "master-data", title: "Master Data" },
  { id: "daily", title: "Daily Operations" },
  { id: "accounting", title: "Accounting" },
  { id: "analysis", title: "Analysis" },
  { id: "statutory", title: "Statutory" },
]

export const UTILITY_TOOLS: UtilityTool[] = [
  {
    id: "business-setup",
    group: "setup",
    title: "Business Setup",
    description: "Legal identity, tax IDs, invoice footer",
    path: "/utilities/business-setup",
    roles: ["admin"],
  },
  {
    id: "financial-year",
    group: "setup",
    title: "Financial Year",
    description: "Active FY for accounting & statutory reports",
    path: "/utilities/financial-year",
    roles: ["admin"],
  },
  {
    id: "barcode",
    group: "setup",
    title: "Barcode Generator",
    description: "Preview and print product barcodes",
    path: "/utilities/barcode",
    roles: ["admin", "manager"],
  },
  {
    id: "recycle-bin",
    group: "setup",
    title: "Recycle Bin",
    description: "Restore deactivated master records",
    path: "/utilities/recycle-bin",
    roles: ["admin"],
  },
  {
    id: "master-data",
    group: "master-data",
    title: "Master Data Hub",
    description: "Products, categories, brands, units, tax & more",
    path: "/utilities/master-data",
    roles: ["admin", "manager"],
  },
  {
    id: "master-brands",
    group: "master-data",
    title: "Brands",
    description: "Canonical brand names (case-insensitive)",
    path: "/utilities/master-data/brands",
    roles: ["admin", "manager"],
  },
  {
    id: "master-units",
    group: "master-data",
    title: "Units",
    description: "Units of measure (g, kg, pcs, …)",
    path: "/utilities/master-data/units",
    roles: ["admin", "manager"],
  },
  {
    id: "master-tax-rates",
    group: "master-data",
    title: "Tax Rates",
    description: "GST slabs for catalog & POS",
    path: "/utilities/master-data/tax-rates",
    roles: ["admin", "manager"],
  },
  {
    id: "master-payment-methods",
    group: "master-data",
    title: "Payment Methods",
    description: "Enable or label Cash / UPI / On account",
    path: "/utilities/master-data/payment-methods",
    roles: ["admin"],
  },
  {
    id: "daybook",
    group: "daily",
    title: "Daybook",
    description: "Chronological projected ledger activity",
    path: "/utilities/daybook",
    roles: ["admin", "manager"],
  },
  {
    id: "all-transactions",
    group: "daily",
    title: "All Transactions",
    description: "Consolidated business transactions",
    path: "/utilities/all-transactions",
    roles: ["admin", "manager"],
  },
  {
    id: "accounting",
    group: "accounting",
    title: "Accounting Hub",
    description: "Single-company GL map, pipelines & reports",
    path: "/utilities/accounting",
    roles: ["admin", "manager"],
  },
  {
    id: "chart-of-accounts",
    group: "accounting",
    title: "Chart of Accounts",
    description: "Ledger codes for the retail CoA",
    path: "/utilities/chart-of-accounts",
    roles: ["admin", "manager"],
  },
  {
    id: "manual-journal",
    group: "accounting",
    title: "Manual Journal",
    description: "Post balanced adjusting entries",
    path: "/utilities/manual-journal",
    roles: ["admin"],
  },
  {
    id: "trial-balance",
    group: "accounting",
    title: "Trial Balance",
    description: "Debit/credit balances by account",
    path: "/utilities/trial-balance",
    roles: ["admin", "manager"],
  },
  {
    id: "profit-loss",
    group: "accounting",
    title: "Profit & Loss",
    description: "Income, expenses, gross & net profit",
    path: "/utilities/profit-loss",
    roles: ["admin", "manager"],
  },
  {
    id: "balance-sheet",
    group: "accounting",
    title: "Balance Sheet",
    description: "Assets, liabilities & equity projection",
    path: "/utilities/balance-sheet",
    roles: ["admin", "manager"],
  },
  {
    id: "cash-flow",
    group: "accounting",
    title: "Cash Flow",
    description: "Cash vs UPI inflows and outflows",
    path: "/utilities/cash-flow",
    roles: ["admin", "manager"],
  },
  {
    id: "account-statement",
    group: "accounting",
    title: "Account Statement",
    description: "Ledger activity for one account",
    path: "/utilities/account-statement",
    roles: ["admin", "manager"],
  },
  {
    id: "report-item",
    group: "analysis",
    title: "Report by Item",
    description: "Item performance (reporting module)",
    path: "/utilities/report-item",
    roles: ["admin", "manager"],
  },
  {
    id: "report-operator",
    group: "analysis",
    title: "Report by Operator",
    description: "Sales activity by cashier/staff",
    path: "/utilities/report-operator",
    roles: ["admin", "manager"],
  },
  {
    id: "report-role",
    group: "analysis",
    title: "Report by Role",
    description: "Activity summarized by staff role",
    path: "/utilities/report-role",
    roles: ["admin", "manager"],
  },
  {
    id: "report-expense",
    group: "analysis",
    title: "Expense Reports",
    description: "Expenses by category and period",
    path: "/utilities/report-expense",
    roles: ["admin", "manager"],
  },
  {
    id: "expense-create",
    group: "daily",
    title: "Add Expense",
    description: "Record a store expense (Cash / UPI)",
    path: "/utilities/expenses",
    roles: ["admin", "manager"],
  },
  {
    id: "erp-chain",
    group: "daily",
    title: "ERP chain",
    description: "Purchase → sale event spine & journal health",
    path: "/utilities/erp-chain",
    roles: ["admin", "manager"],
  },
  {
    id: "audit-log",
    group: "daily",
    title: "Audit log",
    description: "Who changed prices, stock, discounts, refunds, settings",
    path: "/utilities/audit",
    roles: ["admin", "manager"],
  },
  {
    id: "sync-center",
    group: "daily",
    title: "Sync Center",
    description: "Pending, failed, dead letter, incomplete sales & retry",
    path: "/utilities/sync",
    roles: ["admin", "manager"],
  },
  {
    id: "pricing",
    group: "daily",
    title: "Promotions Management",
    description:
      "Discounts, loyalty, campaigns, points mapping, birthday & free-item promos",
    path: "/utilities/pricing",
    roles: ["admin", "manager"],
  },
  {
    id: "gst",
    group: "statutory",
    title: "GST / Tax Billing",
    description:
      "HSN, rates, CGST/SGST/IGST, B2B/B2C, tax credit notes — filing placeholders",
    path: "/utilities/gst",
    roles: ["admin", "manager"],
  },
  {
    id: "tcs",
    group: "statutory",
    title: "TCS Reports",
    description: "TCS readiness (data-dependent)",
    path: "/utilities/tcs",
    roles: ["admin"],
  },
  {
    id: "form-27eq",
    group: "statutory",
    title: "Form 27EQ",
    description: "Statutory form scaffold — not filing-ready",
    path: "/utilities/form-27eq",
    roles: ["admin"],
  },
]

export function utilityToolsForRole(role: UserRole | null | undefined) {
  if (!role) return []
  return UTILITY_TOOLS.filter((t) => t.roles.includes(role))
}

export function canAccessUtilityPath(
  role: UserRole | null | undefined,
  pathname: string
): boolean {
  if (!role) return false
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  if (path === "/utilities") {
    return role === "admin" || role === "manager"
  }
  return UTILITY_TOOLS.some(
    (t) => t.path === path && t.roles.includes(role)
  )
}
