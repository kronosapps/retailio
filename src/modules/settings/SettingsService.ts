import {
  getPaymentSettings,
  savePaymentSettings,
  type PaymentSettings,
} from "@/modules/payment/settings/paymentSettings"

/**
 * Settings module facade.
 * Merchant UPI remains in payment settings store for backward compatibility.
 * Google Script URL comes from VITE_GOOGLE_SCRIPT_URL (env), not secrets in code.
 */
export class SettingsService {
  static getPaymentSettings(): PaymentSettings {
    return getPaymentSettings()
  }

  static savePaymentSettings(patch: Partial<PaymentSettings>): PaymentSettings {
    return savePaymentSettings(patch)
  }

  static getGoogleScriptUrl(): string {
    return (import.meta.env.VITE_GOOGLE_SCRIPT_URL as string | undefined)?.trim() || ""
  }
}
