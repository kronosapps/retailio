import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "expenses"
const STORAGE_KEY = "retailos.expenses.v1"

export type ExpenseRecord = {
  id: string
  title: string
  amountPaisa: number
  category?: string
  paymentMethod?: string | null
  createdBy?: string | null
  storeId: string | null
  createdAt: string
}

type LocalStore = { version: 1; items: ExpenseRecord[] }

function readLocal(): ExpenseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeLocal(items: ExpenseRecord[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, items } satisfies LocalStore)
  )
}

function upsertLocal(record: ExpenseRecord) {
  const items = readLocal()
  const idx = items.findIndex((i) => i.id === record.id)
  if (idx >= 0) items[idx] = record
  else items.push(record)
  writeLocal(items)
  return record
}

/** Owns the `expenses` collection (+ local fallback). */
export class ExpenseRepository {
  list(): ExpenseRecord[] {
    return [...readLocal()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }

  async hydrate(): Promise<ExpenseRecord[]> {
    const remote = await listDocuments<ExpenseRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) upsertLocal(row)
    }
    return this.list()
  }

  async save(record: ExpenseRecord): Promise<ExpenseRecord> {
    const next = {
      ...record,
      id: record.id || createId("exp"),
      createdAt: record.createdAt || new Date().toISOString(),
    }
    upsertLocal(next)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      EventTypes.EXPENSE_CREATED,
      next,
      next.storeId
    )
    return next
  }
}

export const expenseRepository = new ExpenseRepository()
