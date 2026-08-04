import type { PayableInvoice } from "./types"

export type PaymentSessionCallbacks = {
  onPaid?: (invoiceId: string) => void
  onCancelled?: (invoiceId: string) => void
}

type SessionState = {
  open: boolean
  invoice: PayableInvoice | null
  callbacks: PaymentSessionCallbacks
}

type Listener = () => void

let state: SessionState = {
  open: false,
  invoice: null,
  callbacks: {},
}

const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function getPaymentSession(): SessionState {
  return state
}

export function subscribePaymentSession(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Billing entry point — opens the Payment Module for one invoice. */
export function openPayment(
  invoice: PayableInvoice,
  callbacks: PaymentSessionCallbacks = {}
) {
  state = {
    open: true,
    invoice: { ...invoice, customerName: invoice.customerName || "Walk-in" },
    callbacks,
  }
  emit()
}

export function closePayment() {
  state = {
    open: false,
    invoice: null,
    callbacks: {},
  }
  emit()
}

export function setPaymentSessionInvoice(invoice: PayableInvoice) {
  if (!state.open) return
  state = { ...state, invoice }
  emit()
}
