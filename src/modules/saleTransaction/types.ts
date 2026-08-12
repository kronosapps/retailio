/**
 * Sale transaction boundaries — explicit states for POS checkout integrity.
 * Stock remains deducted only after payment; this record makes partials recoverable.
 */

export type SaleTransactionStatus =
  | "CheckoutStarted"
  | "InvoicePending"
  | "InvoiceCreated"
  | "PaymentPending"
  | "PaymentConfirmed"
  | "InvoiceFinalized"
  | "StockFinalized"
  | "Completed"
  | "Failed"
  | "Cancelled"

export type SaleTransactionSteps = {
  checkoutStartedAt: string | null
  invoicePendingAt: string | null
  invoiceCreatedAt: string | null
  paymentPendingAt: string | null
  paymentConfirmedAt: string | null
  invoiceFinalizedAt: string | null
  stockFinalizedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  bankingOk: boolean | null
  accountingOk: boolean | null
  tillOk: boolean | null
}

export type SaleTransactionRecord = {
  id: string
  status: SaleTransactionStatus
  invoiceId: string | null
  paymentId: string | null
  posLaneId: number | null
  storeId: string | null
  cashierId: string | null
  cashierName: string | null
  customerName: string | null
  amountPaisa: number | null
  failureReason: string | null
  steps: SaleTransactionSteps
  createdAt: string
  updatedAt: string
}

export type BeginSaleTransactionInput = {
  posLaneId?: number | null
  storeId?: string | null
  cashierId?: string | null
  cashierName?: string | null
  customerName?: string | null
  amountPaisa?: number | null
}

export const SALE_TXN_STATUS_LABELS: Record<SaleTransactionStatus, string> = {
  CheckoutStarted: "Checkout started",
  InvoicePending: "Invoice pending",
  InvoiceCreated: "Invoice created",
  PaymentPending: "Payment pending",
  PaymentConfirmed: "Payment confirmed",
  InvoiceFinalized: "Invoice finalized",
  StockFinalized: "Stock finalized",
  Completed: "Completed",
  Failed: "Failed",
  Cancelled: "Cancelled",
}

export const INCOMPLETE_SALE_STATUSES: SaleTransactionStatus[] = [
  "CheckoutStarted",
  "InvoicePending",
  "InvoiceCreated",
  "PaymentPending",
  "PaymentConfirmed",
  "InvoiceFinalized",
  "StockFinalized",
  "Failed",
]

export function emptySaleSteps(): SaleTransactionSteps {
  return {
    checkoutStartedAt: null,
    invoicePendingAt: null,
    invoiceCreatedAt: null,
    paymentPendingAt: null,
    paymentConfirmedAt: null,
    invoiceFinalizedAt: null,
    stockFinalizedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    bankingOk: null,
    accountingOk: null,
    tillOk: null,
  }
}

/** Terminal statuses — no further happy-path advances. */
export function isSaleTerminal(status: SaleTransactionStatus): boolean {
  return status === "Completed" || status === "Cancelled"
}
