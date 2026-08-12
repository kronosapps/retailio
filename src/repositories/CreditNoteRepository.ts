import {
  getLocalCreditNote,
  listLocalCreditNotes,
  nextCreditNoteNumber,
  upsertLocalCreditNote,
  type CreditNoteRecord,
} from "@/data/creditNotes"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.CREDIT_NOTES

export type { CreditNoteRecord }

export type IssueCreditNoteInput = {
  customerId: string
  customerName: string
  amountPaisa: number
  invoiceId?: string | null
  salesReturnId?: string | null
  reason?: string | null
  storeId?: string | null
  actorId?: string | null
}

export class CreditNoteRepository {
  list(): CreditNoteRecord[] {
    return listLocalCreditNotes()
  }

  getById(id: string): CreditNoteRecord | null {
    return getLocalCreditNote(id)
  }

  listOpenForCustomer(customerId: string): CreditNoteRecord[] {
    return this.list().filter(
      (c) =>
        c.customerId === customerId &&
        c.status === "OPEN" &&
        c.balancePaisa > 0
    )
  }

  async hydrate(): Promise<CreditNoteRecord[]> {
    const remote = await listDocuments<CreditNoteRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalCreditNote(row)
      }
    }
    return this.list()
  }

  async issue(input: IssueCreditNoteInput): Promise<CreditNoteRecord> {
    const now = new Date().toISOString()
    const amount = Math.max(0, Math.round(input.amountPaisa))
    const record: CreditNoteRecord = {
      id: createId("cn"),
      creditNoteNumber: nextCreditNoteNumber(),
      customerId: input.customerId,
      customerName: input.customerName,
      invoiceId: input.invoiceId ?? null,
      salesReturnId: input.salesReturnId ?? null,
      amountPaisa: amount,
      balancePaisa: amount,
      status: "OPEN",
      reason: input.reason?.trim() || null,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      appliedAt: null,
    }
    const next = upsertLocalCreditNote(record)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      EventTypes.CREDIT_NOTE_ISSUED,
      {
        id: next.id,
        creditNoteNumber: next.creditNoteNumber,
        customerId: next.customerId,
        customerName: next.customerName,
        amountPaisa: next.amountPaisa,
        invoiceId: next.invoiceId,
        salesReturnId: next.salesReturnId,
        storeId: next.storeId,
      },
      next.storeId
    )
    return next
  }

  async save(record: CreditNoteRecord): Promise<CreditNoteRecord> {
    const next = upsertLocalCreditNote({
      ...record,
      updatedAt: new Date().toISOString(),
    })
    await upsertDocument(COLLECTION, next.id, next)
    return next
  }
}

export const creditNoteRepository = new CreditNoteRepository()
