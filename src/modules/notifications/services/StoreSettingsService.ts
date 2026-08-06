import { storeSettingsRepository } from "@/repositories/StoreSettingsRepository"
import type { StoreSettingsRecord } from "../types/notification"

export class StoreSettingsService {
  static getCached(storeId: string) {
    return storeSettingsRepository.getCached(storeId)
  }

  static get(storeId: string) {
    return storeSettingsRepository.get(storeId)
  }

  static save(
    storeId: string,
    patch: Partial<StoreSettingsRecord>,
    actorId: string | null = null
  ) {
    return storeSettingsRepository.save(storeId, patch, actorId)
  }
}
