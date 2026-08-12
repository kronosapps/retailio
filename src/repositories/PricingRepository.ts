import {
  appendLocalPriceHistory,
  listLocalPriceHistory,
} from "@/data/priceHistory"
import {
  getLocalCoupon,
  getLocalCouponByCode,
  listLocalCoupons,
  upsertLocalCoupon,
} from "@/data/coupons"
import {
  getLocalPromotion,
  listLocalPromotions,
  removeLocalPromotion,
  upsertLocalPromotion,
} from "@/data/promotions"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type {
  CouponRecord,
  PriceHistoryRecord,
  PromotionRecord,
} from "@/modules/pricing/types"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

export class PromotionRepository {
  list(): PromotionRecord[] {
    return listLocalPromotions()
  }

  getById(id: string): PromotionRecord | null {
    return getLocalPromotion(id)
  }

  async hydrate(): Promise<PromotionRecord[]> {
    const remote = await listDocuments<PromotionRecord>(COLLECTIONS.PROMOTIONS)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalPromotion(row)
      }
    }
    return this.list()
  }

  async save(
    record: PromotionRecord,
    isNew: boolean
  ): Promise<PromotionRecord> {
    const next = upsertLocalPromotion({
      ...record,
      updatedAt: new Date().toISOString(),
    })
    await upsertDocument(COLLECTIONS.PROMOTIONS, next.id, next)
    await EventPublisher.publish(
      isNew ? EventTypes.PROMOTION_CREATED : EventTypes.PROMOTION_UPDATED,
      next,
      next.storeId
    )
    return next
  }

  async remove(id: string): Promise<void> {
    const existing = getLocalPromotion(id)
    removeLocalPromotion(id)
    if (existing) {
      await EventPublisher.publish(
        EventTypes.PROMOTION_UPDATED,
        { ...existing, active: false, deleted: true },
        existing.storeId
      )
    }
  }
}

export class CouponRepository {
  list(): CouponRecord[] {
    return listLocalCoupons()
  }

  getById(id: string): CouponRecord | null {
    return getLocalCoupon(id)
  }

  getByCode(code: string): CouponRecord | null {
    return getLocalCouponByCode(code)
  }

  async hydrate(): Promise<CouponRecord[]> {
    const remote = await listDocuments<CouponRecord>(COLLECTIONS.COUPONS)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalCoupon(row)
      }
    }
    return this.list()
  }

  async save(record: CouponRecord, isNew: boolean): Promise<CouponRecord> {
    const next = upsertLocalCoupon({
      ...record,
      updatedAt: new Date().toISOString(),
    })
    await upsertDocument(COLLECTIONS.COUPONS, next.id, next)
    await EventPublisher.publish(
      isNew ? EventTypes.COUPON_CREATED : EventTypes.COUPON_UPDATED,
      next,
      next.storeId
    )
    return next
  }

  async recordRedemption(id: string): Promise<CouponRecord | null> {
    const existing = getLocalCoupon(id)
    if (!existing) return null
    return this.save(
      { ...existing, redemptionCount: existing.redemptionCount + 1 },
      false
    )
  }
}

export class PriceHistoryRepository {
  list(sku?: string): PriceHistoryRecord[] {
    return listLocalPriceHistory(sku)
  }

  async append(
    input: Omit<PriceHistoryRecord, "id">
  ): Promise<PriceHistoryRecord> {
    const record: PriceHistoryRecord = {
      id: createId("ph"),
      ...input,
    }
    appendLocalPriceHistory(record)
    await upsertDocument(COLLECTIONS.PRICE_HISTORY, record.id, record)
    await EventPublisher.publish(
      EventTypes.PRICE_CHANGED,
      record,
      record.storeId
    )
    return record
  }

  async hydrate(): Promise<PriceHistoryRecord[]> {
    const remote = await listDocuments<PriceHistoryRecord>(
      COLLECTIONS.PRICE_HISTORY
    )
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        appendLocalPriceHistory(row)
      }
    }
    return this.list()
  }
}

export const promotionRepository = new PromotionRepository()
export const couponRepository = new CouponRepository()
export const priceHistoryRepository = new PriceHistoryRepository()
