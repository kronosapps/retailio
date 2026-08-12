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
    consumers: ["SyncManager", "NotificationEngine"],
    notes: "Issue does not change stock. Pending-purchase alerts.",
  },
  {
    id: "goods_receipt",
    label: "Goods Receipt",
    events: [EventTypes.GOODS_RECEIVED, EventTypes.INVENTORY_CHANGED],
    consumers: ["SyncManager", "NotificationEngine"],
    notes: "Stock + lots via PurchaseReceivingService → InventoryService.",
  },
  {
    id: "purchase_invoice",
    label: "Purchase Invoice (AP)",
    events: [EventTypes.PURCHASE_INVOICE_POSTED],
    consumers: ["AccountingEngine", "SyncManager", "NotificationEngine"],
    notes: "Dr Inventory / Cr AP (valued receipt at bill).",
  },
  {
    id: "supplier_payment",
    label: "Supplier Payment",
    events: [EventTypes.SUPPLIER_PAYMENT_RECORDED],
    consumers: ["BankingEngine", "AccountingEngine", "SyncManager", "NotificationEngine"],
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
    consumers: ["AccountingEngine", "SyncManager", "NotificationEngine"],
    notes: "Opening/adjust/damage/wastage → GL; SALE/PURCHASE covered elsewhere. Low/out/expiry alerts.",
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
      "TillEngine",
      "NotificationEngine",
      "SaleTransactionEngine",
      "SyncManager",
    ],
    notes:
      "Stock FEFO only after PAYMENT_RECEIVED. SaleTransactionEngine records Checkout→Completed boundaries for recovery; unpaid never deducts stock.",
  },
  {
    id: "cashier_shift",
    label: "Cashier Shift / Till",
    events: [
      EventTypes.SHIFT_OPENED,
      EventTypes.TILL_MOVEMENT,
      EventTypes.SHIFT_CLOSED,
    ],
    consumers: ["SyncManager", "NotificationEngine"],
    notes: "Cashier accountability — separate from Banking cashbook. Cash variance alerts on close.",
  },
  {
    id: "customer",
    label: "Customer",
    events: [EventTypes.CUSTOMER_CREATED, EventTypes.CUSTOMER_UPDATED],
    consumers: ["SyncManager", "NotificationEngine"],
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
