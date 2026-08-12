import type { Paisa } from "@/lib/money"

export type BankingChannel = "cash" | "upi"

export type BankingEntryDirection = "in" | "out"

export type BankingEntrySource =
  | "opening"
  | "sale"
  | "refund"
  | "supplier_payment"
  | "adjustment"
  | "mock"

export type BankingLedgerEntry = {
  id: string
  createdAt: string
  channel: BankingChannel
  direction: BankingEntryDirection
  amountPaisa: Paisa
  source: BankingEntrySource
  reference: string | null
  note: string
  storeId: string | null
}

export type BankingOpeningBalances = {
  cashPaisa: Paisa
  upiPaisa: Paisa
  updatedAt: string | null
}

export type BankingSnapshot = {
  opening: BankingOpeningBalances
  entries: BankingLedgerEntry[]
  balances: {
    cashPaisa: Paisa
    upiPaisa: Paisa
    totalPaisa: Paisa
  }
  totals: {
    cashInPaisa: Paisa
    cashOutPaisa: Paisa
    upiInPaisa: Paisa
    upiOutPaisa: Paisa
  }
}

export type BankingAccountInfo = {
  accountName: string
  accountNumber: string
  ifsc: string
  branch: string
  bankName: string
  upiId: string
}

export type BankingGstInfo = {
  gstin: string
  legalName: string
  tradeName: string
  address: string
}

export type SetOpeningBalancesInput = {
  cashRupees: number
  upiRupees: number
  passcode: string
}

export type ManualAdjustmentInput = {
  channel: BankingChannel
  direction: BankingEntryDirection
  amountRupees: number
  note: string
  passcode: string
  storeId?: string | null
}
