import { EventTypes, type EventType } from "@/events/EventTypes"

/**
 * Canonical Purchase → Inventory → Sales → Banking → Accounting chain.
 * Stages publish domain events; engines subscribe (never UI).
 */
export type ErpChainStage = {
  id: string
  label: string
  events: EventType[]
  consumers: string[]
  notes?: string
}

export const ERP_CHAIN: ErpChainStage[] = [
  {
    id: "supplier",
    label: "Supplier",
    events: [EventTypes.SUPPLIER_CREATED, EventTypes.SUPPLIER_UPDATED],
    consumers: ["SyncManager"],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    events: [
      EventTypes.PURCHASE_ORDER_CREATED,
      EventTypes.PURCHASE_ORDER_UPDATED,
      EventTypes.PURCHASE_ORDER_ISSUED,
    ],
    consumers: ["SyncManager"],
    notes: "Issue does not change stock.",
  },
  {
    id: "goods_receipt",
    label: "Goods Receipt",
    events: [EventTypes.GOODS_RECEIVED, EventTypes.INVENTORY_CHANGED],
    consumers: ["SyncManager"],
    notes: "Stock + lots via PurchaseReceivingService → InventoryService.",
  },
  {
    id: "purchase_invoice",
    label: "Purchase Invoice (AP)",
    events: [EventTypes.PURCHASE_INVOICE_POSTED],
    consumers: ["AccountingEngine", "SyncManager"],
    notes: "Dr Inventory / Cr AP (valued receipt at bill).",
  },
  {
    id: "supplier_payment",
    label: "Supplier Payment",
    events: [EventTypes.SUPPLIER_PAYMENT_RECORDED],
    consumers: ["BankingEngine", "AccountingEngine", "SyncManager"],
  },
  {
    id: "inventory",
    label: "Inventory",
    events: [
      EventTypes.INVENTORY_CHANGED,
      EventTypes.INVENTORY_MOVEMENT_CREATED,
      EventTypes.STOCK_ADJUSTED,
      EventTypes.STOCK_TAKE_POSTED,
    ],
    consumers: ["AccountingEngine", "SyncManager"],
    notes: "Opening/adjust/damage/wastage → GL; SALE/PURCHASE covered elsewhere.",
  },
  {
    id: "pos_sale",
    label: "POS Sale + Payment",
    events: [
      EventTypes.INVOICE_CREATED,
      EventTypes.PAYMENT_RECEIVED,
    ],
    consumers: [
      "InventoryEngine",
      "BankingEngine",
      "AccountingEngine",
      "NotificationEngine",
      "SyncManager",
    ],
    notes: "Stock FEFO + banking + sales/COGS journals from PAYMENT_RECEIVED.",
  },
  {
    id: "customer",
    label: "Customer",
    events: [EventTypes.CUSTOMER_CREATED, EventTypes.CUSTOMER_UPDATED],
    consumers: ["SyncManager"],
  },
  {
    id: "banking",
    label: "Banking",
    events: [],
    consumers: [],
    notes: "Consumer only — posts cash/UPI ledger from payment events.",
  },
  {
    id: "accounting",
    label: "Accounting",
    events: [],
    consumers: [],
    notes: "Consumer only — durable journals from purchase/sale/stock events.",
  },
  {
    id: "reports",
    label: "Reports",
    events: [],
    consumers: [],
    notes: "Pull-only from repositories / journals — not event-driven.",
  },
]

export function erpChainEvents(): EventType[] {
  const set = new Set<EventType>()
  for (const stage of ERP_CHAIN) {
    for (const e of stage.events) set.add(e)
  }
  return [...set]
}
