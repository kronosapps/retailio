/**
 * Payment Module public API.
 * Billing should only use these exports — never UPI/QR internals.
 */
export { openPayment, closePayment } from "./session"
export { PaymentDialog } from "./components/PaymentDialog"
export { usePayment } from "./hooks/usePayment"
export { useCashCounter } from "./hooks/useCashCounter"
export type {
  PayableInvoice,
  Payment,
  PaymentSession,
  PaymentMethod,
  PaymentSettlementInput,
  PaymentStatus,
} from "./types"
export { PaymentError } from "./types"
export type { PaymentProvider } from "./providers/PaymentProvider"
export { ManualUPIProvider, manualUpiProvider } from "./providers/ManualUPIProvider"
export {
  getPaymentSettings,
  savePaymentSettings,
} from "./settings/paymentSettings"
export {
  createPaymentSession,
  attachQrToSession,
  startPaymentSession,
} from "./services/paymentSession"
