import type { Paisa } from "@/lib/money"

import { PaymentError } from "../types"
import {
  amountRupeesFromPaisa,
  formatAmountForUpi,
  invoiceNoteFromSequence,
  isValidVpa,
} from "../utils"

export type BuildUpiUrlInput = {
  merchantUpiId: string
  merchantName: string
  amountPaisa: Paisa
  currency: string
  transactionReference: string
  dailySequence: number
}

/** Build a dynamic UPI deep link for one invoice / transaction reference. */
export function buildUpiPaymentUrl(input: BuildUpiUrlInput): string {
  const pa = input.merchantUpiId.trim()
  if (!isValidVpa(pa)) {
    throw new PaymentError(
      "INVALID_UPI",
      "Merchant UPI ID is invalid. Use a VPA like store@upi."
    )
  }

  const params = new URLSearchParams()
  params.set("pa", pa)
  params.set("pn", input.merchantName.trim() || "Store")
  params.set("am", formatAmountForUpi(input.amountPaisa))
  params.set("cu", (input.currency || "INR").toUpperCase())
  params.set("tr", input.transactionReference)
  params.set("tn", invoiceNoteFromSequence(input.dailySequence))

  return `upi://pay?${params.toString()}`
}

export function parseUpiAmountRupees(amountPaisa: Paisa): number {
  return amountRupeesFromPaisa(amountPaisa)
}
