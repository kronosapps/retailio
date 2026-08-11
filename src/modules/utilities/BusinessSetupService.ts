import { env } from "@/core/config/env"
import { BankingService } from "@/modules/banking"
import { StoreSettingsService } from "@/modules/notifications/services/StoreSettingsService"
import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"

export type BusinessSetupView = {
  settings: StoreSettingsRecord
  bankingGst: ReturnType<typeof BankingService.getGstInfo>
  bankingAccount: ReturnType<typeof BankingService.getAccountInfo>
  envDefaults: {
    gstin: string
    legalName: string
    tradeName: string
  }
}

/**
 * Business setup — settings repository + env banking/GST display.
 */
export class BusinessSetupService {
  static async get(storeId: string): Promise<BusinessSetupView> {
    const settings = await StoreSettingsService.get(storeId)
    return {
      settings,
      bankingGst: BankingService.getGstInfo(),
      bankingAccount: BankingService.getAccountInfo(),
      envDefaults: {
        gstin: env.banking.gstin,
        legalName: env.banking.gstLegalName,
        tradeName: env.banking.gstTradeName,
      },
    }
  }

  static save(
    storeId: string,
    patch: Partial<StoreSettingsRecord>,
    actorId: string | null
  ) {
    return StoreSettingsService.save(storeId, patch, actorId)
  }
}
