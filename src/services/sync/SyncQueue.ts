import type { SyncStatus } from "@/types/domain"
import { createId } from "@/utils/id"

const QUEUE_KEY = "retailos.sync.queue.v1"
const DEAD_LETTER_KEY = "retailos.sync.deadletter.v1"

export type SyncQueueItem = {
  id: string
  action: "insert" | "update"
  sheet: string
  data: unknown
  eventType: string
  eventId: string
  status: SyncStatus
  retries: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  error: string | null
}

function readList(key: string): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { items?: SyncQueueItem[] }
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeList(key: string, items: SyncQueueItem[]) {
  localStorage.setItem(key, JSON.stringify({ items }))
}

/**
 * Persistent sync queue with offline survival.
 * Status lifecycle: Pending → Syncing → Completed | Failed → Retrying → DeadLetter
 */
export class SyncQueue {
  enqueue(input: {
    action: "insert" | "update"
    sheet: string
    data: unknown
    eventType: string
    eventId: string
  }): SyncQueueItem {
    const now = new Date().toISOString()
    const item: SyncQueueItem = {
      id: createId("sync"),
      ...input,
      status: "Pending",
      retries: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
    }
    const items = readList(QUEUE_KEY)
    items.push(item)
    writeList(QUEUE_KEY, items)
    return item
  }

  listPending(): SyncQueueItem[] {
    return readList(QUEUE_KEY).filter(
      (item) =>
        item.status === "Pending" ||
        item.status === "Retrying" ||
        item.status === "Failed"
    )
  }

  listAll(): SyncQueueItem[] {
    return readList(QUEUE_KEY)
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
    return readList(DEAD_LETTER_KEY)
  }
}

export const syncQueue = new SyncQueue()
