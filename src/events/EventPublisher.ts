import { createId } from "@/utils/id"

import { EventBus } from "./EventBus"
import { logEventPublished } from "./EventLog"
import type { DomainEvent, EventType } from "./EventTypes"

/**
 * Thin helper used by repositories after a successful persist.
 */
export class EventPublisher {
  static async publish<TPayload>(
    type: EventType,
    payload: TPayload,
    storeId: string | null = null
  ): Promise<DomainEvent<TPayload>> {
    const event: DomainEvent<TPayload> = {
      id: createId("evt"),
      type,
      storeId,
      payload,
      createdAt: new Date().toISOString(),
      source: "repository",
    }
    logEventPublished(event)
    await EventBus.publish(event)
    return event
  }
}
