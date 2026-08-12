import { env } from "@/core/config/env"
import { rupeesToPaisa } from "@/lib/money"

import {
  appendLedgerEntry,
  getOpeningBalances,
  listLedgerEntries,
  setOpeningBalancesLocal,
} from "./bankingStore"
import type {
  BankingAccountInfo,
  BankingGstInfo,
  BankingSnapshot,
  ManualAdjustmentInput,
  SetOpeningBalancesInput,
} from "./types"

const UNLOCK_KEY = "retailos.banking.unlock.v1"
const UNLOCK_TTL_MS = 30 * 60 * 1000

export class BankingAuthError extends Error {
  constructor(message = "Incorrect admin passcode.") {
    super(message)
    this.name = "BankingAuthError"
  }
}

function assertPasscode(passcode: string) {
  if (passcode.trim() !== env.banking.passcode) {
    throw new BankingAuthError()
  }
}

/**
 * Banking module — opening balances + cash/UPI ledger.
 * Account & GST identity come from env. Mutations require banking passcode.
 */
export class BankingService {
  static getAccountInfo(): BankingAccountInfo {
    return {
      accountName: env.banking.accountName,
      accountNumber: env.banking.accountNumber,
      ifsc: env.banking.ifsc,
      branch: env.banking.branch,
      bankName: env.banking.bankName,
      upiId: env.banking.upiId,
    }
  }

  static getGstInfo(): BankingGstInfo {
    return {
      gstin: env.banking.gstin,
      legalName: env.banking.gstLegalName,
      tradeName: env.banking.gstTradeName,
      address: env.banking.gstAddress,
    }
  }

  static verifyPasscode(passcode: string): boolean {
    return passcode.trim() === env.banking.passcode
  }

  static unlock(passcode: string): void {
    assertPasscode(passcode)
    sessionStorage.setItem(
      UNLOCK_KEY,
      JSON.stringify({ at: Date.now() })
    )
  }

  static lock(): void {
    sessionStorage.removeItem(UNLOCK_KEY)
  }

  static isUnlocked(): boolean {
    try {
      const raw = sessionStorage.getItem(UNLOCK_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as { at?: number }
      if (typeof parsed.at !== "number") return false
      if (Date.now() - parsed.at > UNLOCK_TTL_MS) {
        sessionStorage.removeItem(UNLOCK_KEY)
        return false
      }
      return true
    } catch {
      return false
    }
  }

  /** Require passcode for every mutation (session unlock only reveals the form). */
  static assertCanEdit(passcode?: string | null) {
    if (!passcode || !String(passcode).trim()) {
      throw new BankingAuthError("Enter admin passcode to change banking.")
    }
    assertPasscode(passcode)
    this.unlock(passcode)
  }

  static getSnapshot(): BankingSnapshot {
    const opening = getOpeningBalances()
    const entries = listLedgerEntries()

    let cashIn = 0
    let cashOut = 0
    let upiIn = 0
    let upiOut = 0

    for (const entry of entries) {
      if (entry.channel === "cash") {
        if (entry.direction === "in") cashIn += entry.amountPaisa
        else cashOut += entry.amountPaisa
      } else {
        if (entry.direction === "in") upiIn += entry.amountPaisa
        else upiOut += entry.amountPaisa
      }
    }

    const cashPaisa = opening.cashPaisa + cashIn - cashOut
    const upiPaisa = opening.upiPaisa + upiIn - upiOut

    return {
      opening,
      entries,
      balances: {
        cashPaisa,
        upiPaisa,
        totalPaisa: cashPaisa + upiPaisa,
      },
      totals: {
        cashInPaisa: cashIn,
        cashOutPaisa: cashOut,
        upiInPaisa: upiIn,
        upiOutPaisa: upiOut,
      },
    }
  }

  static setOpeningBalances(input: SetOpeningBalancesInput) {
    this.assertCanEdit(input.passcode)
    return setOpeningBalancesLocal(
      rupeesToPaisa(input.cashRupees),
      rupeesToPaisa(input.upiRupees)
    )
  }

  static addManualAdjustment(input: ManualAdjustmentInput) {
    this.assertCanEdit(input.passcode)
    return appendLedgerEntry({
      channel: input.channel,
      direction: input.direction,
      amountPaisa: rupeesToPaisa(input.amountRupees),
      source: "adjustment",
      note: input.note || "Manual adjustment",
      storeId: input.storeId ?? env.storeId,
    })
  }

  /** Called by BankingEngine on PAYMENT_RECEIVED (no passcode). */
  static recordSalePayment(input: {
    paymentId: string
    amountRupees: number
    paymentMethod: string
    invoiceNumber?: string | null
    storeId?: string | null
    paidAt?: string | null
  }) {
    const channel =
      input.paymentMethod === "Cash" ? "cash" : ("upi" as const)
    return appendLedgerEntry({
      channel,
      direction: "in",
      amountPaisa: rupeesToPaisa(input.amountRupees),
      source: "sale",
      reference: input.paymentId,
      note: `Sale ${input.invoiceNumber || ""}`.trim(),
      storeId: input.storeId ?? env.storeId,
      createdAt: input.paidAt || undefined,
    })
  }

  /** Called by BankingEngine on refund events (no passcode). */
  static recordRefund(input: {
    refundId: string
    amountRupees: number
    method: string
    invoiceId?: string | null
    storeId?: string | null
    createdAt?: string | null
  }) {
    const channel = input.method === "Cash" ? "cash" : ("upi" as const)
    return appendLedgerEntry({
      channel,
      direction: "out",
      amountPaisa: rupeesToPaisa(input.amountRupees),
      source: "refund",
      reference: input.refundId,
      note: `Refund ${input.invoiceId || ""}`.trim(),
      storeId: input.storeId ?? env.storeId,
      createdAt: input.createdAt || undefined,
    })
  }

  /** Called by BankingEngine on SUPPLIER_PAYMENT_RECORDED (no passcode). */
  static recordSupplierPayment(input: {
    paymentId: string
    amountRupees: number
    paymentMethod: string
    invoiceNumber?: string | null
    storeId?: string | null
    paidAt?: string | null
  }) {
    const channel =
      input.paymentMethod === "Cash" ? "cash" : ("upi" as const)
    return appendLedgerEntry({
      channel,
      direction: "out",
      amountPaisa: rupeesToPaisa(input.amountRupees),
      source: "supplier_payment",
      reference: input.paymentId,
      note: `Supplier pay ${input.invoiceNumber || ""}`.trim(),
      storeId: input.storeId ?? env.storeId,
      createdAt: input.paidAt || undefined,
    })
  }
}
