import { EventBus, type EventHandler } from "./EventBus"
import type { EventType } from "./EventTypes"

/**
 * Convenience wrapper for long-lived subscribers (SyncManager, analytics).
 */
export class EventSubscriber {
  private unsubscribers: Array<() => void> = []

  on<T = unknown>(type: EventType | "*", handler: EventHandler<T>) {
    this.unsubscribers.push(EventBus.subscribe(type, handler))
    return this
  }

  dispose() {
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
  }
}
