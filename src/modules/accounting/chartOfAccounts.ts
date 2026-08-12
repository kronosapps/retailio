import type { LedgerAccount } from "./types"

/** Minimal retail chart of accounts for projected entries. */
export const CHART_OF_ACCOUNTS: LedgerAccount[] = [
  { code: "1000", name: "Cash in Hand", type: "asset", normalBalance: "debit" },
  { code: "1010", name: "Bank / UPI", type: "asset", normalBalance: "debit" },
  {
    code: "1200",
    name: "Inventory Asset",
    type: "asset",
    normalBalance: "debit",
  },
  {
    code: "1300",
    name: "GST Input Credit",
    type: "asset",
    normalBalance: "debit",
  },
  {
    code: "2000",
    name: "Accounts Payable",
    type: "liability",
    normalBalance: "credit",
  },
  {
    code: "2100",
    name: "GST Payable",
    type: "liability",
    normalBalance: "credit",
  },
  {
    code: "2200",
    name: "Customer Credits",
    type: "liability",
    normalBalance: "credit",
  },
  {
    code: "3000",
    name: "Owner Capital / Balancing",
    type: "equity",
    normalBalance: "credit",
  },
  { code: "4000", name: "Sales", type: "income", normalBalance: "credit" },
  {
    code: "4100",
    name: "Sales Returns",
    type: "income",
    normalBalance: "debit",
  },
  { code: "5000", name: "Expenses", type: "expense", normalBalance: "debit" },
  {
    code: "5100",
    name: "Cost of Goods Sold",
    type: "expense",
    normalBalance: "debit",
  },
]

export function getAccount(code: string): LedgerAccount | undefined {
  return CHART_OF_ACCOUNTS.find((a) => a.code === code)
}

export const ACCOUNT_CODES = {
  CASH: "1000",
  UPI: "1010",
  INVENTORY: "1200",
  GST_INPUT: "1300",
  AP: "2000",
  GST_PAYABLE: "2100",
  CUSTOMER_CREDIT: "2200",
  CAPITAL: "3000",
  SALES: "4000",
  SALES_RETURNS: "4100",
  EXPENSES: "5000",
  COGS: "5100",
} as const
