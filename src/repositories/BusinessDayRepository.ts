import {
  getLocalBusinessDay,
  getLocalBusinessDayByKey,
  getOpenBusinessDay,
  listLocalBusinessDays,
  upsertLocalBusinessDay,
} from "@/data/businessDays"
import { COLLECTIONS } from "@/core/firebase/collections"
import type { BusinessDayRecord } from "@/modules/dayOps/types"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.BUSINESS_DAYS

export class BusinessDayRepository {
  list(): BusinessDayRecord[] {
    return listLocalBusinessDays()
  }

  getById(id: string): BusinessDayRecord | null {
    return getLocalBusinessDay(id)
  }

  getByDayKey(
    dayKey: string,
    storeId: string | null = null
  ): BusinessDayRecord | null {
    return getLocalBusinessDayByKey(dayKey, storeId)
  }

  getOpen(storeId: string | null = null): BusinessDayRecord | null {
    return getOpenBusinessDay(storeId)
  }

  async hydrate(): Promise<BusinessDayRecord[]> {
    const remote = await listDocuments<BusinessDayRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id || !row.dayKey) continue
        upsertLocalBusinessDay(row)
      }
    }
    return this.list()
  }

  async save(record: BusinessDayRecord): Promise<BusinessDayRecord> {
    const next: BusinessDayRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    upsertLocalBusinessDay(next)
    await upsertDocument(COLLECTION, next.id, next)
    return next
  }
}

export const businessDayRepository = new BusinessDayRepository()
