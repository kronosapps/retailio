import { createId } from "@/utils/id"

import type { DomainEvent, EventType } from "./EventTypes"

const LOG_KEY = "retailos.events.log.v1"

export type EventLogStatus =
  | "Published"
  | "Handled"
  | "Failed"

export type EventLogEntry = {
  id: string
  eventId: string
  type: EventType
  status: EventLogStatus
  retries: number
  createdAt: string
  completedAt: string | null
  error: string | null
}

function readLogs(): EventLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { entries?: EventLogEntry[] }
    return Array.isArray(parsed.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

function writeLogs(entries: EventLogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify({ entries }))
}

/** Persist domain event audit trail for debugging / ops. */
export function logEventPublished(event: DomainEvent): EventLogEntry {
  const entry: EventLogEntry = {
    id: createId("elog"),
    eventId: event.id,
    type: event.type,
    status: "Published",
    retries: 0,
    createdAt: event.createdAt,
    completedAt: null,
    error: null,
  }
  const entries = readLogs()
  entries.push(entry)
  writeLogs(entries.slice(-500))
  return entry
}

export function listEventLogs(): EventLogEntry[] {
  return [...readLogs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
