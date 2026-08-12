import { env } from "@/core/config/env"
import {
  getGstSettings,
  saveGstSettings,
  type GstSettings,
} from "@/data/gstSettings"
import {
  getAlertThresholds,
  saveAlertThresholds,
  type AlertThresholds,
} from "@/modules/notifications/alertThresholds"
import {
  getPaymentSettings,
  savePaymentSettings,
  type PaymentSettings,
} from "@/modules/payment/settings/paymentSettings"
import { StoreSettingsService } from "@/modules/notifications/services/StoreSettingsService"
import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"

import {
  getInventorySettings,
  saveInventorySettings,
  type InventorySettings,
} from "./inventorySettings"
import { getPosSettings, savePosSettings, type PosSettings } from "./posSettings"

/**
 * Settings facade — business configuration only.
 * Deploy / secrets: use `env` from `@/core/config/env` (read-only in UI).
 */
export class SettingsService {
  // —— Payments (local store) ——

  static getPaymentSettings(): PaymentSettings {
    return getPaymentSettings()
  }

  static savePaymentSettings(patch: Partial<PaymentSettings>): PaymentSettings {
    return savePaymentSettings(patch)
  }

  // —— Tax / GST (local store; canonical editor also on /utilities/gst) ——

  static getGstSettings(): GstSettings {
    return getGstSettings()
  }

  static saveGstSettings(patch: Partial<GstSettings>): GstSettings {
    return saveGstSettings(patch)
  }

  // —— Inventory defaults ——

  static getInventorySettings(): InventorySettings {
    return getInventorySettings()
  }

  static saveInventorySettings(
    patch: Partial<InventorySettings>
  ): InventorySettings {
    return saveInventorySettings(patch)
  }

  // —— POS ——

  static getPosSettings(): PosSettings {
    return getPosSettings()
  }

  static savePosSettings(patch: Partial<PosSettings>): PosSettings {
    return savePosSettings(patch)
  }

  // —— Notifications / alerts ——

  static getAlertThresholds(): AlertThresholds {
    return getAlertThresholds()
  }

  static saveAlertThresholds(
    patch: Partial<AlertThresholds>
  ): AlertThresholds {
    return saveAlertThresholds(patch)
  }

  // —— Store / invoice branding (Firestore settings doc) ——

  static getStoreSettings(storeId: string) {
    return StoreSettingsService.get(storeId)
  }

  static saveStoreSettings(
    storeId: string,
    patch: Partial<StoreSettingsRecord>,
    actorId?: string | null
  ) {
    return StoreSettingsService.save(storeId, patch, actorId)
  }

  // —— Env (read-only) ——

  static getGoogleScriptUrl(): string {
    return env.googleScriptUrl
  }

  static getWhatsappWebhookUrl(): string {
    return env.whatsappWebhookUrl
  }

  static getStoreIdDefault(): string {
    return env.storeId
  }

  static isSheetsConfigured(): boolean {
    return Boolean(env.googleScriptUrl.trim())
  }

  /** Snapshot of non-secret env flags for Integrations UI. */
  static getEnvIntegrationStatus() {
    return {
      storeId: env.storeId,
      googleScriptConfigured: Boolean(env.googleScriptUrl.trim()),
      whatsappWebhookConfigured: Boolean(env.whatsappWebhookUrl.trim()),
      firebaseConfigured: Boolean(env.firebase.projectId && env.firebase.apiKey),
      bankingAccountName: env.banking.accountName,
      bankingGstin: env.banking.gstin,
    }
  }
}
