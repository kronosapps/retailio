import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "expenses"

export type ExpenseRecord = {
  id: string
  title: string
  amountPaisa: number
  category?: string
  storeId: string | null
  createdAt: string
}

/** Owns the `expenses` collection. */
export class ExpenseRepository {
  async save(record: ExpenseRecord): Promise<ExpenseRecord> {
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      EventTypes.EXPENSE_CREATED,
      record,
      record.storeId
    )
    return record
  }
}

export const expenseRepository = new ExpenseRepository()
