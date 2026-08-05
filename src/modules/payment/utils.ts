import { paisaToRupees, type Paisa } from "@/lib/money"

import type { PaymentMethod, PaymentStatus } from "./types"

export function formatAmountForUpi(amountPaisa: Paisa): string {
  return paisaToRupees(amountPaisa).toFixed(2)
}

export function amountRupeesFromPaisa(amountPaisa: Paisa): number {
  return Number(formatAmountForUpi(amountPaisa))
}

export function invoiceNoteFromSequence(dailySequence: number): string {
  return `Invoice ${dailySequence}`
}

export function createId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${rand}`
}

export function isValidVpa(upiId: string): boolean {
  const value = upiId.trim()
  if (!value) return false
  // Basic VPA check: local@handle
  return /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(value)
}

export function paymentMethodLabel(method: PaymentMethod | string): string {
  switch (method) {
    case "BankTransfer":
      return "Bank Transfer"
    case "SplitPayment":
      return "Split Payment"
    case "Cash":
    case "UPI":
    case "Card":
      return method
    default:
      return String(method)
  }
}

/** Normalize / validate UPI txn last-4 from cashier input. */
export function normalizeUpiTxnLast4(value: string): string | null {
  const digits = value.replace(/\D/g, "").slice(-4)
  return digits.length === 4 ? digits : null
}

export function paymentStatusTone(
  status: PaymentStatus
): "success" | "pending" | "danger" | "muted" | "failed" {
  switch (status) {
    case "Paid":
      return "success"
    case "Pending":
      return "pending"
    case "Failed":
      return "failed"
    case "Cancelled":
      return "danger"
    case "Expired":
      return "muted"
    default:
      return "muted"
  }
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
