import { listEventLogs, type EventLogEntry } from "@/events/EventLog"
import type { EventType } from "@/events/EventTypes"
import { BankingService } from "@/modules/banking"
import { InventoryService } from "@/modules/inventory"
import { journalRepository } from "@/repositories/JournalRepository"

import { ERP_CHAIN, type ErpChainStage } from "./erpChain"

export type ErpStageActivity = {
  stage: ErpChainStage
  /** idle = publisher with no recent events; active = saw events; consumer = no outbound events */
  activity: "active" | "idle" | "consumer"
  lastEventAt: string | null
  lastEventType: EventType | null
  eventCount24h: number
}

export type ErpChainHealth = {
  postedJournals: number
  saleJournals: number
  purchaseInvoiceJournals: number
  inventoryMovementJournals: number
  bankingEntries: number
  skusInStock: number
  recentChainEvents: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Read-only ERP chain status for Utilities — event log + journal/banking snapshots.
 * Never writes Firestore or publishes events.
 */
export class ErpChainStatusService {
  static getStageActivity(): ErpStageActivity[] {
    const logs = listEventLogs()
    const cutoff = Date.now() - DAY_MS

    return ERP_CHAIN.map((stage) => {
      if (stage.events.length === 0) {
        return {
          stage,
          activity: "consumer" as const,
          lastEventAt: null,
          lastEventType: null,
          eventCount24h: 0,
        }
      }

      const matching = logs.filter((e) => stage.events.includes(e.type))
      const last = matching[0] ?? null
      const eventCount24h = matching.filter(
        (e) => new Date(e.createdAt).getTime() >= cutoff
      ).length

      return {
        stage,
        activity: last ? ("active" as const) : ("idle" as const),
        lastEventAt: last?.createdAt ?? null,
        lastEventType: last?.type ?? null,
        eventCount24h,
      }
    })
  }

  static listRecentChainEvents(limit = 40): EventLogEntry[] {
    const chainTypes = new Set(
      ERP_CHAIN.flatMap((s) => s.events)
    )
    return listEventLogs()
      .filter((e) => chainTypes.has(e.type))
      .slice(0, limit)
  }

  static getHealth(): ErpChainHealth {
    const journals = journalRepository.list().filter((j) => j.source === "posted")
    const banking = BankingService.getSnapshot()
    const stock = InventoryService.getAllStock({ includeInactive: false })
    const chainEvents = this.listRecentChainEvents(500)

    return {
      postedJournals: journals.length,
      saleJournals: journals.filter((j) => j.referenceType === "sale").length,
      purchaseInvoiceJournals: journals.filter(
        (j) => j.referenceType === "purchase_invoice"
      ).length,
      inventoryMovementJournals: journals.filter(
        (j) => j.referenceType === "inventory_movement"
      ).length,
      bankingEntries: banking.entries.length,
      skusInStock: stock.filter((r) => r.quantity > 0).length,
      recentChainEvents: chainEvents.length,
    }
  }
}
