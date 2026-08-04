import type { DomainEvent, EventType } from "./EventTypes"

export type EventHandler<T = unknown> = (
  event: DomainEvent<T>
) => void | Promise<void>

/**
 * In-process pub/sub bus.
 * Repositories publish; SyncManager and future listeners subscribe.
 */
class EventBusImpl {
  private handlers = new Map<EventType | "*", Set<EventHandler>>()

  subscribe<T = unknown>(
    type: EventType | "*",
    handler: EventHandler<T>
  ): () => void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(handler as EventHandler)
    this.handlers.set(type, set)
    return () => {
      set.delete(handler as EventHandler)
    }
  }

  async publish<T = unknown>(event: DomainEvent<T>): Promise<void> {
    const specific = this.handlers.get(event.type) ?? new Set()
    const wildcard = this.handlers.get("*") ?? new Set()
    const all = [...specific, ...wildcard]
    for (const handler of all) {
      await handler(event as DomainEvent)
    }
  }
}

export const EventBus = new EventBusImpl()
