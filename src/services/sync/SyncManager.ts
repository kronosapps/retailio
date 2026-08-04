import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"

import { googleSheetsSyncProvider } from "./GoogleSheetsSyncProvider"
import { retryManager } from "./RetryManager"
import { syncQueue, type SyncQueueItem } from "./SyncQueue"
import type { SyncProvider } from "./SyncProvider"

type ConfigurableProvider = SyncProvider & { isConfigured?: () => boolean }

type SheetRoute = {
  sheet: string
  sync: (provider: SyncProvider, data: unknown) => Promise<void>
}

const ROUTES: Partial<Record<string, SheetRoute>> = {
  [EventTypes.INVOICE_CREATED]: {
    sheet: "Invoices",
    sync: (p, data) => p.syncInvoice(data),
  },
  [EventTypes.INVOICE_UPDATED]: {
    sheet: "Invoices",
    sync: (p, data) => p.syncInvoice(data),
  },
  [EventTypes.PAYMENT_RECEIVED]: {
    sheet: "Payments",
    sync: (p, data) => p.syncPayment(data),
  },
  [EventTypes.PAYMENT_FAILED]: {
    sheet: "Payments",
    sync: (p, data) => p.syncPayment(data),
  },
  [EventTypes.INVENTORY_CHANGED]: {
    sheet: "Inventory",
    sync: (p, data) => p.syncInventory(data),
  },
  [EventTypes.CUSTOMER_CREATED]: {
    sheet: "Customers",
    sync: (p, data) => p.syncCustomer(data),
  },
  [EventTypes.CUSTOMER_UPDATED]: {
    sheet: "Customers",
    sync: (p, data) => p.syncCustomer(data),
  },
  [EventTypes.SUPPLIER_CREATED]: {
    sheet: "Suppliers",
    sync: (p, data) => p.syncSupplier(data),
  },
  [EventTypes.EXPENSE_CREATED]: {
    sheet: "Expenses",
    sync: (p, data) => p.syncExpense(data),
  },
  [EventTypes.PRODUCT_CREATED]: {
    sheet: "Products",
    sync: (p, data) => p.syncInventory(data),
  },
  [EventTypes.PRODUCT_UPDATED]: {
    sheet: "Products",
    sync: (p, data) => p.syncInventory(data),
  },
}

/**
 * Subscribes to domain events and drains the sync queue.
 * Never imported by React UI components for business work.
 */
export class SyncManager {
  private subscriber = new EventSubscriber()
  private providers: ConfigurableProvider[] = [googleSheetsSyncProvider]
  private processing = false
  private started = false

  /** Boot once from app bootstrap — not from React feature components. */
  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on("*", (event) => {
      this.enqueueFromEvent(event)
      void this.processQueue()
    })

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        void this.processQueue()
      })
    }

    void this.processQueue()
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  registerProvider(provider: SyncProvider) {
    this.providers.push(provider)
  }

  private enqueueFromEvent(event: DomainEvent) {
    const route = ROUTES[event.type]
    if (!route) return

    syncQueue.enqueue({
      action: "insert",
      sheet: route.sheet,
      data: event.payload,
      eventType: event.type,
      eventId: event.id,
    })
  }

  async processQueue() {
    if (this.processing) return
    if (typeof navigator !== "undefined" && !navigator.onLine) return

    this.processing = true
    try {
      const pending = syncQueue.listPending()
      for (const item of pending) {
        await this.processItem(item)
      }
    } finally {
      this.processing = false
    }
  }

  private async processItem(item: SyncQueueItem) {
    const route = ROUTES[item.eventType]
    if (!route) {
      syncQueue.update(item.id, {
        status: "Completed",
        completedAt: new Date().toISOString(),
      })
      return
    }

    syncQueue.update(item.id, { status: "Syncing", error: null })

    try {
      for (const provider of this.providers) {
        if (provider.isConfigured && !provider.isConfigured()) continue
        await route.sync(provider, item.data)
      }

      syncQueue.update(item.id, {
        status: "Completed",
        completedAt: new Date().toISOString(),
        error: null,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sync error"
      const retries = item.retries + 1

      if (retryManager.shouldRetry(retries)) {
        syncQueue.update(item.id, {
          status: "Retrying",
          retries,
          error: message,
        })
        await delay(retryManager.nextDelayMs(retries))
        const fresh = syncQueue.listAll().find((row) => row.id === item.id)
        if (fresh) await this.processItem({ ...fresh, retries })
      } else {
        syncQueue.moveToDeadLetter({ ...item, retries }, message)
      }
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const syncManager = new SyncManager()
