import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "customers"

export type CustomerRecord = {
  id: string
  name: string
  phone?: string
  email?: string
  storeId: string | null
  createdAt: string
  updatedAt: string
}

/** Owns the `customers` collection. */
export class CustomerRepository {
  async save(record: CustomerRecord, isNew = true): Promise<CustomerRecord> {
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      isNew ? EventTypes.CUSTOMER_CREATED : EventTypes.CUSTOMER_UPDATED,
      record,
      record.storeId
    )
    return record
  }
}

export const customerRepository = new CustomerRepository()
