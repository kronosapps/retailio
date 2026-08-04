import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "suppliers"

export type SupplierRecord = {
  id: string
  name: string
  phone?: string
  storeId: string | null
  createdAt: string
}

/** Owns the `suppliers` collection. */
export class SupplierRepository {
  async save(record: SupplierRecord): Promise<SupplierRecord> {
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      EventTypes.SUPPLIER_CREATED,
      record,
      record.storeId
    )
    return record
  }
}

export const supplierRepository = new SupplierRepository()
