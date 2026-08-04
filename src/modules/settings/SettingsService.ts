import { env } from "@/core/config/env"
import {
  getPaymentSettings,
  savePaymentSettings,
  type PaymentSettings,
} from "@/modules/payment/settings/paymentSettings"

/**
 * Settings module facade.
 * Merchant UPI remains in payment settings store for backward compatibility.
 * Google Script URL comes from env (VITE_GOOGLE_SCRIPT_URL), not secrets in code.
 */
export class SettingsService {
  static getPaymentSettings(): PaymentSettings {
    return getPaymentSettings()
  }

  static savePaymentSettings(patch: Partial<PaymentSettings>): PaymentSettings {
    return savePaymentSettings(patch)
  }

  static getGoogleScriptUrl(): string {
    return env.googleScriptUrl
  }
}
