import { COLLECTIONS } from "@/core/firebase/collections"
import type { JournalEntry } from "@/modules/accounting/types"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.JOURNAL_ENTRIES
const STORAGE_KEY = "retailos.journal.v1"

type LocalStore = { version: 1; items: JournalEntry[] }

function readLocal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<LocalStore>
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeLocal(items: JournalEntry[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, items } satisfies LocalStore)
  )
}

function upsertLocal(record: JournalEntry) {
  const items = readLocal()
  const idx = items.findIndex((i) => i.id === record.id)
  if (idx >= 0) items[idx] = record
  else items.push(record)
  writeLocal(items)
  return record
}

function refKey(referenceType: string, referenceId: string) {
  return `${referenceType}:${referenceId}`
}

/**
 * Append-only posted journal store.
 * Idempotent by referenceType + referenceId — never silently overwrites posted lines.
 */
export class JournalRepository {
  list(): JournalEntry[] {
    return [...readLocal()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )
  }

  getByReference(
    referenceType: JournalEntry["referenceType"],
    referenceId: string
  ): JournalEntry | null {
    return (
      readLocal().find(
        (e) =>
          e.referenceType === referenceType && e.referenceId === referenceId
      ) ?? null
    )
  }

  async hydrate(): Promise<JournalEntry[]> {
    const remote = await listDocuments<JournalEntry>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id || !row.referenceId) continue
        const existing = this.getByReference(row.referenceType, row.referenceId)
        if (existing) continue
        upsertLocal({ ...row, source: "posted" })
      }
    }
    return this.list()
  }

  /**
   * Save a posted entry. If the same reference already exists, returns existing (no overwrite).
   */
  async savePosted(entry: JournalEntry): Promise<JournalEntry> {
    const existing = this.getByReference(entry.referenceType, entry.referenceId)
    if (existing) return existing

    const next: JournalEntry = {
      ...entry,
      id: entry.id || createId("je"),
      source: "posted",
      createdAt: entry.createdAt || new Date().toISOString(),
    }
    upsertLocal(next)
    await upsertDocument(COLLECTION, next.id, next)
    return next
  }

  /** Test/helper: clear local journal (does not wipe Firestore). */
  clearLocal() {
    writeLocal([])
  }

  static referenceKey(
    referenceType: JournalEntry["referenceType"],
    referenceId: string
  ) {
    return refKey(referenceType, referenceId)
  }
}

export const journalRepository = new JournalRepository()
