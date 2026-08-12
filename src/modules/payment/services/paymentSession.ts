import { SaleTransactionService } from "@/modules/saleTransaction"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"

import { getPaymentSettings } from "../settings/paymentSettings"
import {
  appendPaymentLog,
  getPaymentById,
  getPaymentByInvoiceId,
  listPaymentsForInvoice,
} from "../store/paymentStore"
import {
  PaymentError,
  type Payment,
  type PaymentMethod,
  type PayableInvoice,
} from "../types"
import { amountRupeesFromPaisa } from "../utils"
import { generateQrDataUrl } from "./qrGenerator"
import { buildUpiPaymentUrl } from "./upi"

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

/** INV-20260804-00051 → PAY-20260804-00051 (attempt 1), then PAY-…-2, … */
export function buildPaymentId(invoiceId: string, attempt: number): string {
  const base = invoiceId.startsWith("INV-")
    ? `PAY-${invoiceId.slice(4)}`
    : `PAY-${todayDateKey()}-${invoiceId}`
  return attempt <= 1 ? base : `${base}-${attempt}`
}

export function buildTransactionReference(
  invoiceId: string,
  attempt: number
): string {
  return attempt <= 1 ? invoiceId : `${invoiceId}-R${attempt}`
}

function nextAttemptForInvoice(invoiceId: string): number {
  return listPaymentsForInvoice(invoiceId).length + 1
}

async function cancelOpenSessions(
  invoiceId: string,
  exceptPaymentId?: string
) {
  for (const prior of listPaymentsForInvoice(invoiceId)) {
    if (exceptPaymentId && prior.paymentId === exceptPaymentId) continue
    if (prior.status !== "Pending" && prior.status !== "Expired") continue
    await paymentRepository.update(prior.paymentId, { status: "Cancelled" })
    appendPaymentLog({
      paymentId: prior.paymentId,
      invoiceId: prior.invoiceId,
      event: "CANCELLED",
      message: "Superseded by a new payment session.",
    })
  }
}

/**
 * Create a payment session via PaymentRepository (Firestore + local).
 * QR is attached afterward — never the other way around.
 */
export async function createPaymentSession(options: {
  invoice: PayableInvoice
  method: PaymentMethod
  customerName: string
  customerPhone?: string | null
  customerId?: string | null
  remarks: string | null
}): Promise<Payment> {
  const invoice = options.invoice
  if (invoice.paymentStatus === "Paid") {
    throw new PaymentError("ALREADY_PAID", "Invoice is already paid.")
  }
  if (invoice.paymentStatus === "Refunded") {
    throw new PaymentError("UNKNOWN", "Invoice was refunded.")
  }

  await cancelOpenSessions(invoice.invoiceId)

  const attempt = nextAttemptForInvoice(invoice.invoiceId)
  const paymentId = buildPaymentId(invoice.invoiceId, attempt)
  const transactionReference = buildTransactionReference(
    invoice.invoiceId,
    attempt
  )

  if (getPaymentById(paymentId)) {
    throw new PaymentError(
      "DUPLICATE_TR",
      `Payment session ${paymentId} already exists.`
    )
  }

  const settings = getPaymentSettings()
  const nowIso = new Date().toISOString()

  const session: Payment = {
    paymentId,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    transactionReference,
    merchantUPI: settings.merchantUpiId,
    merchantName: settings.merchantName,
    amountPaisa: invoice.amountPaisa,
    amount: amountRupeesFromPaisa(invoice.amountPaisa),
    currency: settings.currency,
    paymentMethod: options.method,
    status: "Pending",
    createdAt: nowIso,
    paidAt: null,
    remarks: options.remarks,
    upiUrl: null,
    qrGeneratedAt: null,
    qrExpiresAt: null,
    customerName: options.customerName.trim() || "Walk-in",
    customerId: options.customerId ?? invoice.customerId ?? null,
    customerPhone: options.customerPhone ?? invoice.customerPhone ?? null,
    storeId: invoice.storeId ?? null,
    attempt,
    upiTxnLast4: null,
    cashReceiptNumber: null,
    cashReceiptId: null,
  }

  await paymentRepository.save(session)
  await invoiceRepository.updatePaymentFields(invoice.invoiceId, {
    paymentId: session.paymentId,
    paymentStatus: "Pending",
    paymentMethod: options.method,
    customerName: session.customerName,
    customerId: session.customerId,
    customerPhone: session.customerPhone,
  })

  void SaleTransactionService.attachPayment(
    invoice.invoiceId,
    session.paymentId
  )

  appendPaymentLog({
    paymentId: session.paymentId,
    invoiceId: session.invoiceId,
    event: "SESSION_CREATED",
    message: `Payment session created (${session.paymentId}) via ${options.method}.`,
  })

  return session
}

/** Generate / refresh QR from an existing payment session. */
export async function attachQrToSession(
  paymentId: string,
  invoice: PayableInvoice,
  options?: { regenerate?: boolean }
): Promise<{ session: Payment; qrDataUrl: string }> {
  const session = getPaymentById(paymentId)
  if (!session) {
    throw new PaymentError("NOT_FOUND", "Payment session not found.")
  }
  if (session.status === "Paid") {
    throw new PaymentError("ALREADY_PAID", "Invoice is already paid.")
  }
  if (session.paymentMethod !== "UPI") {
    throw new PaymentError(
      "UNKNOWN",
      "QR can only be generated for UPI payment sessions."
    )
  }

  const settings = getPaymentSettings()
  const upiUrl = buildUpiPaymentUrl({
    merchantUpiId: settings.merchantUpiId,
    merchantName: settings.merchantName,
    amountPaisa: session.amountPaisa,
    currency: settings.currency,
    transactionReference: session.transactionReference,
    dailySequence: invoice.dailySequence,
  })

  const qrDataUrl = await generateQrDataUrl(upiUrl)
  const qrGeneratedAt = new Date().toISOString()
  const qrExpiresAt = new Date(
    Date.now() + settings.paymentTimeoutMinutes * 60 * 1000
  ).toISOString()

  const updated = await paymentRepository.update(session.paymentId, {
    status: "Pending",
    merchantUPI: settings.merchantUpiId,
    merchantName: settings.merchantName,
    currency: settings.currency,
    upiUrl,
    qrGeneratedAt,
    qrExpiresAt,
  })

  appendPaymentLog({
    paymentId: updated.paymentId,
    invoiceId: updated.invoiceId,
    event: options?.regenerate ? "QR_REGENERATED" : "QR_GENERATED",
    message: options?.regenerate
      ? `QR regenerated for session ${updated.paymentId}`
      : `QR generated for session ${updated.paymentId}`,
  })

  return { session: updated, qrDataUrl }
}

/**
 * Start Pay: create session via repository, then (for UPI) derive QR.
 */
export async function startPaymentSession(options: {
  invoice: PayableInvoice
  method: PaymentMethod
  customerName: string
  customerPhone?: string | null
  customerId?: string | null
  remarks: string | null
  regenerate?: boolean
}): Promise<{ session: Payment; qrDataUrl: string | null }> {
  const session = await createPaymentSession(options)

  if (options.method !== "UPI") {
    return { session, qrDataUrl: null }
  }

  const withQr = await attachQrToSession(session.paymentId, options.invoice, {
    regenerate: options.regenerate,
  })
  return { session: withQr.session, qrDataUrl: withQr.qrDataUrl }
}

/** Latest open session for an invoice, if any. */
export function getActivePaymentSession(invoiceId: string): Payment | null {
  const latest = getPaymentByInvoiceId(invoiceId)
  if (!latest) return null
  if (latest.status === "Pending" || latest.status === "Expired") return latest
  return null
}
