import type { Paisa } from "@/lib/money"

export type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed"
  | "Cancelled"
  | "Expired"
  | "Refunded"
  | "PartiallyRefunded"

/** Active tender types on POS. Legacy Card/Bank/Split may still exist in old rows. */
export type PaymentMethod = "Cash" | "UPI"

export type PaymentLogEvent =
  | "SESSION_CREATED"
  | "QR_GENERATED"
  | "QR_REGENERATED"
  | "MARKED_PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED"
  | "METHOD_CHANGED"
  | "SHEETS_SYNC_OK"
  | "SHEETS_SYNC_FAILED"

/**
 * Payment session — source of truth for a Pay attempt.
 * QR is derived from the session; the QR is not the payment itself.
 */
export type Payment = {
  /** e.g. PAY-20260804-00051 */
  paymentId: string
  invoiceId: string
  invoiceNumber: string
  /** e.g. INV-20260804-00051 (unique per attempt; never reused) */
  transactionReference: string
  merchantUPI: string
  merchantName: string
  /** Amount in paisa (internal). */
  amountPaisa: Paisa
  /** Amount in rupees for UPI `am` / receipts. */
  amount: number
  currency: string
  paymentMethod: PaymentMethod
  status: PaymentStatus
  createdAt: string
  paidAt: string | null
  remarks: string | null
  /** Full UPI deep link when QR has been generated. */
  upiUrl: string | null
  qrGeneratedAt: string | null
  qrExpiresAt: string | null
  customerName: string
  customerId?: string | null
  customerPhone?: string | null
  /** Store scope for notifications / analytics (never a secret). */
  storeId?: string | null
  /** 1-based attempt number for this invoice. */
  attempt: number
  /**
   * Last 4 digits of the UPI transaction id from the customer's phone.
   * Used for end-of-day tally. Null for non-UPI or unpaid sessions.
   */
  upiTxnLast4: string | null
  /** Daily cash slip number (resets each calendar day). Null unless Cash + Paid. */
  cashReceiptNumber: number | null
  /** e.g. CASH-20260805-0001 */
  cashReceiptId: string | null
}

/** Details collected when cashier confirms Mark as Paid. */
export type PaymentSettlementInput =
  | { method: "UPI"; upiTxnLast4: string }
  | { method: "Cash" }

/** Alias clarifying that Payment is a session record. */
export type PaymentSession = Payment

export type PaymentLog = {
  id: string
  paymentId: string
  invoiceId: string
  event: PaymentLogEvent
  message: string
  createdAt: string
}

/** Minimal invoice shape Billing passes into the Payment Module. */
export type PayableInvoice = {
  invoiceId: string
  invoiceNumber: string
  /** Daily sequence part for UPI tn, e.g. 51 → "Invoice 51". */
  dailySequence: number
  amountPaisa: Paisa
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
  storeId?: string | null
  paymentId?: string | null
  paymentStatus?: PaymentStatus | null
  paymentMethod?: PaymentMethod | null
}

export type GeneratePaymentInput = {
  invoice: PayableInvoice
  /** Existing session the provider should encode into the UPI URL. */
  session: PaymentSession
  merchantName: string
  merchantUpiId: string
  currency: string
}

export type GeneratePaymentResult = {
  upiUrl: string
  paymentId: string
  transactionReference: string
  amount: number
  currency: string
}

export type VerifyPaymentResult = {
  verified: boolean
  status: PaymentStatus
  message?: string
}

export class PaymentError extends Error {
  code:
    | "INVALID_UPI"
    | "QR_FAILED"
    | "NETWORK"
    | "ALREADY_PAID"
    | "DUPLICATE_TR"
    | "EXPIRED"
    | "NOT_FOUND"
    | "UNKNOWN"

  constructor(code: PaymentError["code"], message: string) {
    super(message)
    this.name = "PaymentError"
    this.code = code
  }
}
