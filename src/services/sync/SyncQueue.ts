import type { SyncStatus } from "@/types/domain"
import { createId } from "@/utils/id"

const QUEUE_KEY = "retailos.sync.queue.v1"
const DEAD_LETTER_KEY = "retailos.sync.deadletter.v1"
const META_KEY = "retailos.sync.meta.v1"

export type SyncQueueItem = {
  id: string
  action: "insert" | "update" | "upsert"
  sheet: string
  data: unknown
  eventType: string
  eventId: string
  /** Business key for dedupe (e.g. payment:PAY-…). */
  idempotencyKey: string | null
  status: SyncStatus
  retries: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  error: string | null
}

export type SyncMeta = {
  lastSuccessfulSyncAt: string | null
}

function readList(key: string): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { items?: SyncQueueItem[] }
    return Array.isArray(parsed.items)
      ? parsed.items.map(normalizeItem)
      : []
  } catch {
    return []
  }
}

function writeList(key: string, items: SyncQueueItem[]) {
  localStorage.setItem(key, JSON.stringify({ items }))
}

function normalizeItem(raw: SyncQueueItem): SyncQueueItem {
  return {
    ...raw,
    action: raw.action === "update" || raw.action === "upsert" ? raw.action : "insert",
    idempotencyKey:
      typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : null,
  }
}

function readMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { lastSuccessfulSyncAt: null }
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      lastSuccessfulSyncAt:
        typeof parsed.lastSuccessfulSyncAt === "string"
          ? parsed.lastSuccessfulSyncAt
          : null,
    }
  } catch {
    return { lastSuccessfulSyncAt: null }
  }
}

function writeMeta(meta: SyncMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

/**
 * Persistent sync queue with offline survival + idempotent enqueue.
 * Lifecycle: Pending → Syncing → Completed
 *                         ↘ Failed → Retrying → DeadLetter
 */
export class SyncQueue {
  getMeta(): SyncMeta {
    return readMeta()
  }

  markSuccessfulSync(at = new Date().toISOString()) {
    writeMeta({ lastSuccessfulSyncAt: at })
  }

  /**
   * Enqueue with dedupe by eventId and optional idempotencyKey.
   * Returns existing in-flight / completed twin instead of duplicating.
   */
  enqueue(input: {
    action: "insert" | "update" | "upsert"
    sheet: string
    data: unknown
    eventType: string
    eventId: string
    idempotencyKey?: string | null
  }): SyncQueueItem {
    const items = readList(QUEUE_KEY)
    const key = input.idempotencyKey?.trim() || null

    const byEvent = items.find((item) => item.eventId === input.eventId)
    if (byEvent) return byEvent

    if (key) {
      const active = items.find(
        (item) =>
          item.idempotencyKey === key &&
          (item.status === "Pending" ||
            item.status === "Syncing" ||
            item.status === "Retrying" ||
            item.status === "Failed" ||
            item.status === "Completed")
      )
      if (active) return active

      // Same business key sitting in dead letter — revive instead of twin.
      const dead = readList(DEAD_LETTER_KEY)
      const deadHit = dead.find((item) => item.idempotencyKey === key)
      if (deadHit) {
        return this.requeueDeadLetter(deadHit.id, { resetRetries: true })!
      }
    }

    const now = new Date().toISOString()
    const item: SyncQueueItem = {
      id: createId("sync"),
      action: input.action,
      sheet: input.sheet,
      data: input.data,
      eventType: input.eventType,
      eventId: input.eventId,
      idempotencyKey: key,
      status: "Pending",
      retries: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
    }
    items.push(item)
    writeList(QUEUE_KEY, items)
    return item
  }

  listPending(): SyncQueueItem[] {
    return readList(QUEUE_KEY).filter(
      (item) =>
        item.status === "Pending" ||
        item.status === "Syncing" ||
        item.status === "Retrying" ||
        item.status === "Failed"
    )
  }

  listFailed(): SyncQueueItem[] {
    return readList(QUEUE_KEY).filter(
      (item) =>
        (item.status === "Failed" || item.status === "Retrying") &&
        Boolean(item.error)
    )
  }

  listAll(): SyncQueueItem[] {
    return readList(QUEUE_KEY)
  }

  getById(id: string): SyncQueueItem | null {
    return (
      readList(QUEUE_KEY).find((item) => item.id === id) ||
      readList(DEAD_LETTER_KEY).find((item) => item.id === id) ||
      null
    )
  }

  /** Recover crashed Syncing rows on boot. */
  recoverStaleSyncing(): number {
    const items = readList(QUEUE_KEY)
    let n = 0
    for (const item of items) {
      if (item.status === "Syncing") {
        item.status = "Pending"
        item.updatedAt = new Date().toISOString()
        n += 1
      }
    }
    if (n > 0) writeList(QUEUE_KEY, items)
    return n
  }

  update(id: string, patch: Partial<SyncQueueItem>): SyncQueueItem | null {
    const items = readList(QUEUE_KEY)
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) return null
    const next = {
      ...items[index],
      ...patch,
      id: items[index].id,
      updatedAt: new Date().toISOString(),
    }
    items[index] = next
    writeList(QUEUE_KEY, items)
    if (next.status === "Completed") {
      this.markSuccessfulSync(next.completedAt || next.updatedAt)
    }
    return next
  }

  moveToDeadLetter(item: SyncQueueItem, error: string) {
    const dead = readList(DEAD_LETTER_KEY)
    dead.push({
      ...item,
      status: "DeadLetter",
      error,
      updatedAt: new Date().toISOString(),
    })
    writeList(DEAD_LETTER_KEY, dead)
    const items = readList(QUEUE_KEY).filter((row) => row.id !== item.id)
    writeList(QUEUE_KEY, items)
  }

  listDeadLetters(): SyncQueueItem[] {
    return [...readList(DEAD_LETTER_KEY)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    )
  }

  /**
   * Move a dead-letter item back to Pending for another attempt.
   */
  requeueDeadLetter(
    id: string,
    options: { resetRetries?: boolean } = {}
  ): SyncQueueItem | null {
    const dead = readList(DEAD_LETTER_KEY)
    const index = dead.findIndex((item) => item.id === id)
    if (index < 0) return null
    const [item] = dead.splice(index, 1)
    writeList(DEAD_LETTER_KEY, dead)

    const now = new Date().toISOString()
    const revived: SyncQueueItem = {
      ...item,
      status: "Pending",
      retries: options.resetRetries ? 0 : item.retries,
      error: null,
      updatedAt: now,
      completedAt: null,
    }
    const items = readList(QUEUE_KEY)
    items.push(revived)
    writeList(QUEUE_KEY, items)
    return revived
  }

  /** Drop completed items older than maxAgeMs (housekeeping). */
  pruneCompleted(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs
    const items = readList(QUEUE_KEY)
    const next = items.filter((item) => {
      if (item.status !== "Completed") return true
      const t = new Date(item.completedAt || item.updatedAt).getTime()
      return !Number.isFinite(t) || t >= cutoff
    })
    const removed = items.length - next.length
    if (removed > 0) writeList(QUEUE_KEY, next)
    return removed
  }
}

export const syncQueue = new SyncQueue()
