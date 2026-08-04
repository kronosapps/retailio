import { createId } from "../utils"
import type { Payment, PaymentLog, PaymentLogEvent } from "../types"
import { PaymentError } from "../types"

const PAYMENTS_KEY = "retailos.payments.v1"
const LOGS_KEY = "retailos.payment.logs.v1"

type PaymentStore = {
  version: 2
  payments: Payment[]
}

type LegacyPayment = Payment & { id?: string; expiresAt?: string | null }

type LogStore = {
  logs: PaymentLog[]
}

function normalizePayment(raw: LegacyPayment): Payment | null {
  const paymentId = raw.paymentId || raw.id
  if (!paymentId || !raw.invoiceId || !raw.transactionReference) return null

  return {
    paymentId,
    invoiceId: raw.invoiceId,
    invoiceNumber: raw.invoiceNumber || raw.invoiceId,
    transactionReference: raw.transactionReference,
    merchantUPI: raw.merchantUPI || "",
    merchantName: raw.merchantName || "",
    amountPaisa: raw.amountPaisa ?? 0,
    amount: raw.amount ?? 0,
    currency: raw.currency || "INR",
    paymentMethod: raw.paymentMethod || "UPI",
    status: raw.status || "Pending",
    createdAt: raw.createdAt || new Date().toISOString(),
    paidAt: raw.paidAt ?? null,
    remarks: raw.remarks ?? null,
    upiUrl: raw.upiUrl ?? null,
    qrGeneratedAt: raw.qrGeneratedAt ?? null,
    qrExpiresAt: raw.qrExpiresAt ?? raw.expiresAt ?? null,
    customerName: raw.customerName || "Walk-in",
    attempt: typeof raw.attempt === "number" ? raw.attempt : 1,
  }
}

function readPayments(): PaymentStore {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY)
    if (!raw) return { version: 2, payments: [] }
    const parsed = JSON.parse(raw) as {
      version?: number
      payments?: LegacyPayment[]
    }
    const payments = Array.isArray(parsed.payments)
      ? parsed.payments
          .map((item) => normalizePayment(item))
          .filter((item): item is Payment => Boolean(item))
      : []
    return { version: 2, payments }
  } catch {
    return { version: 2, payments: [] }
  }
}

function writePayments(store: PaymentStore) {
  localStorage.setItem(
    PAYMENTS_KEY,
    JSON.stringify({ version: 2, payments: store.payments })
  )
}

function readLogs(): LogStore {
  try {
    const raw = localStorage.getItem(LOGS_KEY)
    if (!raw) return { logs: [] }
    const parsed = JSON.parse(raw) as Partial<LogStore>
    return { logs: Array.isArray(parsed.logs) ? parsed.logs : [] }
  } catch {
    return { logs: [] }
  }
}

function writeLogs(store: LogStore) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(store))
}

export function listPayments(): Payment[] {
  return [...readPayments().payments].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function listPaymentsForInvoice(invoiceId: string): Payment[] {
  return readPayments()
    .payments.filter((p) => p.invoiceId === invoiceId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getPaymentById(paymentId: string): Payment | null {
  return (
    readPayments().payments.find((p) => p.paymentId === paymentId) ?? null
  )
}

export function getPaymentByInvoiceId(invoiceId: string): Payment | null {
  const payments = listPaymentsForInvoice(invoiceId)
  if (payments.length === 0) return null
  return payments[payments.length - 1] ?? null
}

export function getPaymentByTransactionReference(
  transactionReference: string
): Payment | null {
  return (
    readPayments().payments.find(
      (p) => p.transactionReference === transactionReference
    ) ?? null
  )
}

export function savePayment(payment: Payment): Payment {
  const store = readPayments()
  const duplicateTr = store.payments.find(
    (p) =>
      p.transactionReference === payment.transactionReference &&
      p.paymentId !== payment.paymentId
  )
  if (duplicateTr) {
    throw new PaymentError(
      "DUPLICATE_TR",
      `Transaction reference ${payment.transactionReference} already exists.`
    )
  }

  const duplicateId = store.payments.find(
    (p) => p.paymentId === payment.paymentId
  )
  if (duplicateId) {
    const index = store.payments.findIndex(
      (p) => p.paymentId === payment.paymentId
    )
    store.payments[index] = payment
  } else {
    store.payments.push(payment)
  }
  writePayments(store)
  return payment
}

export function updatePayment(
  paymentId: string,
  patch: Partial<Payment>
): Payment {
  const existing = getPaymentById(paymentId)
  if (!existing) {
    throw new PaymentError("NOT_FOUND", "Payment session not found.")
  }
  if (existing.status === "Paid" && patch.status && patch.status !== "Paid") {
    throw new PaymentError("ALREADY_PAID", "Invoice is already paid.")
  }
  const next: Payment = {
    ...existing,
    ...patch,
    paymentId: existing.paymentId,
  }
  return savePayment(next)
}

export function appendPaymentLog(input: {
  paymentId: string
  invoiceId: string
  event: PaymentLogEvent
  message: string
}): PaymentLog {
  const log: PaymentLog = {
    id: createId("plog"),
    paymentId: input.paymentId,
    invoiceId: input.invoiceId,
    event: input.event,
    message: input.message,
    createdAt: new Date().toISOString(),
  }
  const store = readLogs()
  store.logs.push(log)
  writeLogs(store)
  return log
}

export function listPaymentLogs(paymentId?: string): PaymentLog[] {
  const logs = readLogs().logs
  const filtered = paymentId
    ? logs.filter((log) => log.paymentId === paymentId)
    : logs
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
