import {
  buildCustomerRecord,
  deleteLocalCustomer,
  findLocalCustomerByName,
  findLocalCustomerByPhone,
  getLocalCustomer,
  isWalkInName,
  listLocalCustomers,
  normalizeCustomerPhone,
  upsertLocalCustomer,
  type CreateCustomerInput,
  type CustomerRecord,
} from "@/data/customers"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { removeDocument, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "customers"

export type { CreateCustomerInput, CustomerRecord }

export type UpsertCheckoutCustomerInput = {
  name: string
  phone?: string | null
  storeId?: string | null
  actorId?: string | null
  /** Increment spend / visit stats when marking a sale paid. */
  purchasePaisa?: number
  purchasedAt?: string
}

/**
 * Owns the `customers` collection.
 * Local store is primary; Firestore + events are best-effort.
 */
export class CustomerRepository {
  list(): CustomerRecord[] {
    return listLocalCustomers()
  }

  getById(id: string): CustomerRecord | null {
    return getLocalCustomer(id)
  }

  findByPhone(phone: string, storeId?: string | null): CustomerRecord | null {
    return findLocalCustomerByPhone(phone, storeId)
  }

  findByName(name: string, storeId?: string | null): CustomerRecord | null {
    return findLocalCustomerByName(name, storeId)
  }

  async create(
    input: CreateCustomerInput,
    actorId: string | null = null
  ): Promise<CustomerRecord> {
    const id = createId("cust")
    const record = buildCustomerRecord(
      { ...input, createdBy: actorId },
      id
    )
    return this.persist(record, true)
  }

  async save(
    record: CustomerRecord,
    isNew = false
  ): Promise<CustomerRecord> {
    const next: CustomerRecord = {
      ...record,
      phone: normalizeCustomerPhone(record.phone) ?? undefined,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, isNew)
  }

  async delete(id: string): Promise<CustomerRecord | null> {
    const existing = deleteLocalCustomer(id)
    if (!existing) return null
    await removeDocument(COLLECTION, existing.id)
    await EventPublisher.publish(
      EventTypes.CUSTOMER_UPDATED,
      {
        ...existing,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      existing.storeId
    )
    return existing
  }

  /**
   * Resolve or create a customer from payment checkout fields.
   * Skip anonymous Walk-in with no phone.
   */
  async upsertFromCheckout(
    input: UpsertCheckoutCustomerInput
  ): Promise<CustomerRecord | null> {
    const name = input.name.trim() || "Walk-in"
    const phone = normalizeCustomerPhone(input.phone)
    const walkIn = isWalkInName(name)

    if (walkIn && !phone) return null

    let existing: CustomerRecord | null = null
    if (phone) {
      existing = findLocalCustomerByPhone(phone, input.storeId)
    }
    if (!existing && !walkIn) {
      existing = findLocalCustomerByName(name, input.storeId)
    }

    const purchasePaisa =
      typeof input.purchasePaisa === "number" && input.purchasePaisa > 0
        ? input.purchasePaisa
        : 0
    const purchasedAt = input.purchasedAt ?? new Date().toISOString()

    if (existing) {
      const next: CustomerRecord = {
        ...existing,
        name: walkIn ? existing.name : name,
        phone: phone ?? existing.phone,
        storeId: existing.storeId ?? input.storeId ?? null,
        updatedBy: input.actorId ?? existing.updatedBy,
        updatedAt: new Date().toISOString(),
        totalSpendPaisa: existing.totalSpendPaisa + purchasePaisa,
        visitCount: existing.visitCount + (purchasePaisa > 0 ? 1 : 0),
        lastPurchaseAt:
          purchasePaisa > 0 ? purchasedAt : existing.lastPurchaseAt,
      }
      return this.persist(next, false)
    }

    const created = buildCustomerRecord(
      {
        name: walkIn && phone ? `Customer ${phone.slice(-4)}` : name,
        phone: phone ?? undefined,
        storeId: input.storeId ?? null,
        createdBy: input.actorId ?? null,
      },
      createId("cust")
    )

    const withStats: CustomerRecord = {
      ...created,
      totalSpendPaisa: purchasePaisa,
      visitCount: purchasePaisa > 0 ? 1 : 0,
      lastPurchaseAt: purchasePaisa > 0 ? purchasedAt : null,
    }

    return this.persist(withStats, true)
  }

  private async persist(
    record: CustomerRecord,
    isNew: boolean
  ): Promise<CustomerRecord> {
    upsertLocalCustomer(record)
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
