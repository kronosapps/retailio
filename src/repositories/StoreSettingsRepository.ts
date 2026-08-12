import {
  cacheStoreSettings,
  defaultStoreSettings,
  getCachedStoreSettings,
} from "@/data/storeSettings"
import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"
import { AuditService } from "@/modules/audit"

import { getDocument, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "settings"

/**
 * Store branding / WhatsApp public config.
 * Document id: `store_{storeId}` under `settings`.
 * Access tokens never live here — Cloud Functions env only.
 */
export class StoreSettingsRepository {
  docId(storeId: string): string {
    return `store_${storeId}`
  }

  getCached(storeId: string): StoreSettingsRecord | null {
    return getCachedStoreSettings(storeId)
  }

  async get(storeId: string): Promise<StoreSettingsRecord> {
    const cached = getCachedStoreSettings(storeId)
    const remote = await getDocument<StoreSettingsRecord>(
      COLLECTION,
      this.docId(storeId)
    )
    if (remote) {
      const merged: StoreSettingsRecord = {
        ...defaultStoreSettings(storeId),
        ...remote,
        id: this.docId(storeId),
        storeId,
      }
      cacheStoreSettings(merged)
      return merged
    }
    if (cached) return cached
    return defaultStoreSettings(storeId)
  }

  async save(
    storeId: string,
    patch: Partial<StoreSettingsRecord>,
    actorId: string | null = null
  ): Promise<StoreSettingsRecord> {
    const current = await this.get(storeId)
    const next: StoreSettingsRecord = {
      ...current,
      ...patch,
      id: this.docId(storeId),
      storeId,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      createdAt: current.createdAt || new Date().toISOString(),
      createdBy: current.createdBy ?? actorId,
    }
    // Never persist secrets from the client — strip if accidentally passed.
    const safe = { ...next } as StoreSettingsRecord & {
      accessToken?: unknown
      whatsappAccessToken?: unknown
    }
    delete safe.accessToken
    delete safe.whatsappAccessToken

    cacheStoreSettings(safe)
    await upsertDocument(COLLECTION, safe.id, safe)
    void AuditService.record({
      kind: "SETTINGS_CHANGED",
      message: `Store settings updated · ${safe.businessName || storeId}`,
      actorId,
      storeId,
      entityType: "settings",
      entityId: safe.id,
      after: {
        businessName: safe.businessName,
        whatsappBusinessNumber: safe.whatsappBusinessNumber,
        storeGst: safe.storeGst,
      },
    })
    return safe
  }
}

export const storeSettingsRepository = new StoreSettingsRepository()
