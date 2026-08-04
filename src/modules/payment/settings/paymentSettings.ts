import { SAMPLE_PAYMENT_SETTINGS } from "../sample-data"

const STORAGE_KEY = "retailos.payment.settings.v1"

export type PaymentSettings = {
  merchantName: string
  merchantUpiId: string
  merchantMobile: string
  currency: string
  paymentTimeoutMinutes: number
  /** Optional Apps Script / webhook URL. Empty = skip Sheets sync. */
  sheetsWebhookUrl: string
}

function sanitize(settings: Partial<PaymentSettings>): PaymentSettings {
  const timeout = Number(settings.paymentTimeoutMinutes)
  return {
    merchantName:
      typeof settings.merchantName === "string" && settings.merchantName.trim()
        ? settings.merchantName.trim()
        : SAMPLE_PAYMENT_SETTINGS.merchantName,
    merchantUpiId:
      typeof settings.merchantUpiId === "string" && settings.merchantUpiId.trim()
        ? settings.merchantUpiId.trim()
        : SAMPLE_PAYMENT_SETTINGS.merchantUpiId,
    merchantMobile:
      typeof settings.merchantMobile === "string"
        ? settings.merchantMobile.trim()
        : SAMPLE_PAYMENT_SETTINGS.merchantMobile,
    currency:
      typeof settings.currency === "string" && settings.currency.trim()
        ? settings.currency.trim().toUpperCase()
        : "INR",
    paymentTimeoutMinutes:
      Number.isFinite(timeout) && timeout > 0
        ? Math.min(60, Math.floor(timeout))
        : 10,
    sheetsWebhookUrl:
      typeof settings.sheetsWebhookUrl === "string"
        ? settings.sheetsWebhookUrl.trim()
        : "",
  }
}

export function getPaymentSettings(): PaymentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...SAMPLE_PAYMENT_SETTINGS }
    return sanitize(JSON.parse(raw) as Partial<PaymentSettings>)
  } catch {
    return { ...SAMPLE_PAYMENT_SETTINGS }
  }
}

export function savePaymentSettings(
  patch: Partial<PaymentSettings>
): PaymentSettings {
  const next = sanitize({ ...getPaymentSettings(), ...patch })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
