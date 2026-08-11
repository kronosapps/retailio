/** Accounting domain types — projected ledger from business transactions. */

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense"

export type AccountNormalBalance = "debit" | "credit"

export type LedgerAccount = {
  code: string
  name: string
  type: AccountType
  normalBalance: AccountNormalBalance
}

export type JournalLine = {
  accountCode: string
  debitPaisa: number
  creditPaisa: number
}

export type JournalEntrySource = "posted" | "projected"

export type JournalEntry = {
  id: string
  date: string
  createdAt: string
  description: string
  referenceType:
    | "sale"
    | "refund"
    | "expense"
    | "banking"
    | "opening"
    | "inventory"
  referenceId: string
  operatorId: string | null
  operatorName: string | null
  paymentMethod: string | null
  lines: JournalLine[]
  /** Posted = durable GL; projected = on-read backfill. */
  source: JournalEntrySource
  /** Domain event id when posted from EventBus. */
  eventId?: string | null
  storeId?: string | null
}

export type TrialBalanceRow = {
  accountCode: string
  accountName: string
  accountType: AccountType
  debitPaisa: number
  creditPaisa: number
}

export type TrialBalanceResult = {
  asOf: string
  periodLabel: string
  rows: TrialBalanceRow[]
  totalDebitPaisa: number
  totalCreditPaisa: number
  isBalanced: boolean
  imbalancePaisa: number
  projectionNote: string
}

export type BalanceSheetSectionRow = {
  accountCode: string
  accountName: string
  amountPaisa: number
  provisional?: boolean
}

export type BalanceSheetResult = {
  asOf: string
  periodLabel: string
  assets: BalanceSheetSectionRow[]
  liabilities: BalanceSheetSectionRow[]
  equity: BalanceSheetSectionRow[]
  totalAssetsPaisa: number
  totalLiabilitiesPaisa: number
  totalEquityPaisa: number
  isBalanced: boolean
  notes: string[]
}

export type CashFlowResult = {
  periodLabel: string
  openingCashPaisa: number
  openingUpiPaisa: number
  cashInPaisa: number
  cashOutPaisa: number
  upiInPaisa: number
  upiOutPaisa: number
  closingCashPaisa: number
  closingUpiPaisa: number
  operatingInPaisa: number
  operatingOutPaisa: number
  notes: string[]
}

export type AccountStatementLine = {
  date: string
  description: string
  referenceId: string
  debitPaisa: number
  creditPaisa: number
  balancePaisa: number
}

export type AccountStatementResult = {
  accountCode: string
  accountName: string
  periodLabel: string
  openingBalancePaisa: number
  lines: AccountStatementLine[]
  closingBalancePaisa: number
}

export type DaybookRow = {
  date: string
  time: string
  createdAt: string
  transactionId: string
  type: string
  description: string
  debitPaisa: number
  creditPaisa: number
  operator: string
  paymentMethod: string | null
  reference: string
}
