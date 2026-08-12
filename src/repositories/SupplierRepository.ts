import {
  buildSupplierRecord,
  deleteLocalSupplier,
  findLocalSupplierByName,
  getLocalSupplier,
  listLocalSuppliers,
  upsertLocalSupplier,
  type CreateSupplierInput,
  type SupplierRecord,
  type UpdateSupplierInput,
} from "@/data/suppliers"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, removeDocument, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.SUPPLIERS

export type { CreateSupplierInput, SupplierRecord, UpdateSupplierInput }

/**
 * Owns the `suppliers` collection (+ local fallback).
 * UI → SupplierService → SupplierRepository → Firestore/local → events → Sheets.
 */
export class SupplierRepository {
  list(options?: { includeInactive?: boolean }): SupplierRecord[] {
    return listLocalSuppliers(options)
  }

  getById(id: string): SupplierRecord | null {
    return getLocalSupplier(id)
  }

  async hydrate(): Promise<SupplierRecord[]> {
    const remote = await listDocuments<SupplierRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id || !row.name) continue
        upsertLocalSupplier(row)
      }
    }
    return this.list()
  }

  async create(
    input: CreateSupplierInput,
    actorId: string | null = null
  ): Promise<SupplierRecord> {
    const name = input.name.trim()
    if (!name) throw new Error("Supplier name is required.")
    if (findLocalSupplierByName(name)) {
      throw new Error("A supplier with that name already exists.")
    }
    const id = createId("sup")
    const record = buildSupplierRecord(
      { ...input, name, createdBy: actorId },
      id
    )
    return this.persist(record, true)
  }

  async save(
    record: SupplierRecord,
    isNew = false
  ): Promise<SupplierRecord> {
    const name = record.name.trim()
    if (!name) throw new Error("Supplier name is required.")
    const next: SupplierRecord = {
      ...record,
      name,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, isNew)
  }

  async update(input: UpdateSupplierInput): Promise<SupplierRecord> {
    const existing = getLocalSupplier(input.id)
    if (!existing) throw new Error("Supplier not found.")

    const nextName =
      input.name !== undefined ? input.name.trim() || existing.name : existing.name
    const clash = findLocalSupplierByName(nextName)
    if (clash && clash.id !== existing.id) {
      throw new Error("A supplier with that name already exists.")
    }

    const next: SupplierRecord = {
      ...existing,
      name: nextName,
      phone:
        input.phone === undefined
          ? existing.phone
          : input.phone?.trim() || undefined,
      email:
        input.email === undefined
          ? existing.email
          : input.email?.trim() || undefined,
      gstin:
        input.gstin === undefined
          ? existing.gstin
          : input.gstin?.trim().toUpperCase() || undefined,
      address:
        input.address === undefined
          ? existing.address
          : input.address?.trim() || undefined,
      city:
        input.city === undefined
          ? existing.city
          : input.city?.trim() || undefined,
      state:
        input.state === undefined
          ? existing.state
          : input.state?.trim() || undefined,
      pin:
        input.pin === undefined ? existing.pin : input.pin?.trim() || undefined,
      paymentTerms:
        input.paymentTerms === undefined
          ? existing.paymentTerms
          : input.paymentTerms?.trim() || undefined,
      notes:
        input.notes === undefined
          ? existing.notes
          : input.notes?.trim() || undefined,
      active: input.active ?? existing.active,
      updatedBy: input.actorId ?? existing.updatedBy,
      updatedAt: new Date().toISOString(),
    }

    return this.persist(next, false)
  }

  async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ): Promise<SupplierRecord> {
    return this.update({ id, active, actorId })
  }

  /** Soft-delete preferred via setActive(false). Hard delete for recycle/admin. */
  async delete(id: string): Promise<SupplierRecord | null> {
    const existing = deleteLocalSupplier(id)
    if (!existing) return null
    await removeDocument(COLLECTION, existing.id)
    await EventPublisher.publish(
      EventTypes.SUPPLIER_UPDATED,
      {
        ...existing,
        active: false,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      existing.storeId
    )
    return existing
  }

  private async persist(
    record: SupplierRecord,
    isNew: boolean
  ): Promise<SupplierRecord> {
    const next = upsertLocalSupplier(record)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      isNew ? EventTypes.SUPPLIER_CREATED : EventTypes.SUPPLIER_UPDATED,
      toSheetsPayload(next),
      next.storeId
    )
    return next
  }
}

function toSheetsPayload(record: SupplierRecord) {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? "",
    email: record.email ?? "",
    gstin: record.gstin ?? "",
    address: record.address ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    pin: record.pin ?? "",
    paymentTerms: record.paymentTerms ?? "",
    notes: record.notes ?? "",
    active: record.active,
    storeId: record.storeId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export const supplierRepository = new SupplierRepository()
