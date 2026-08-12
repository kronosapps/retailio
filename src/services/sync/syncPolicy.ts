import { EventTypes, type EventType } from "@/events/EventTypes"

/**
 * Events that sync to Google Sheets immediately (catalog / stock).
 * Sales-day events wait for Admin Options → End of Day.
 */
export const LIVE_SHEET_EVENTS = new Set<EventType>([
  EventTypes.INVENTORY_CHANGED,
  EventTypes.INVENTORY_MOVEMENT_CREATED,
  EventTypes.STOCK_ADJUSTED,
  EventTypes.STOCK_TAKE_POSTED,
  EventTypes.PRODUCT_CREATED,
  EventTypes.PRODUCT_UPDATED,
  EventTypes.CATEGORY_CREATED,
  EventTypes.CATEGORY_UPDATED,
  EventTypes.SUPPLIER_CREATED,
  EventTypes.SUPPLIER_UPDATED,
  EventTypes.PURCHASE_ORDER_CREATED,
  EventTypes.PURCHASE_ORDER_UPDATED,
  EventTypes.PURCHASE_ORDER_ISSUED,
  EventTypes.GOODS_RECEIVED,
  EventTypes.PURCHASE_INVOICE_CREATED,
  EventTypes.PURCHASE_INVOICE_POSTED,
  EventTypes.PURCHASE_INVOICE_UPDATED,
  EventTypes.SUPPLIER_PAYMENT_RECORDED,
  EventTypes.PURCHASE_RETURN_CREATED,
  EventTypes.PURCHASE_RETURN_POSTED,
  EventTypes.PURCHASE_RETURN_UPDATED,
  EventTypes.EXPENSE_CREATED,
  EventTypes.SHIFT_OPENED,
  EventTypes.SHIFT_CLOSED,
  EventTypes.TILL_MOVEMENT,
  EventTypes.SALE_RETURN_CREATED,
  EventTypes.SALE_RETURN_POSTED,
  EventTypes.SALE_RETURN_UPDATED,
  EventTypes.CREDIT_NOTE_ISSUED,
  EventTypes.CREDIT_NOTE_APPLIED,
  EventTypes.CREDIT_NOTE_VOIDED,
  EventTypes.CUSTOMER_AR_SETTLED,
  EventTypes.CRM_AUDIT_RECORDED,
  EventTypes.SALE_CANCELLED,
  EventTypes.PROMOTION_CREATED,
  EventTypes.PROMOTION_UPDATED,
  EventTypes.COUPON_CREATED,
  EventTypes.COUPON_UPDATED,
  EventTypes.PRICE_CHANGED,
])

/**
 * Transactional / day-report events — synced only via End of Day.
 */
export const EOD_ONLY_SHEET_EVENTS = new Set<EventType>([
  EventTypes.INVOICE_CREATED,
  EventTypes.INVOICE_UPDATED,
  EventTypes.PAYMENT_RECEIVED,
  EventTypes.PAYMENT_FAILED,
  EventTypes.REFUND_CREATED,
  EventTypes.REFUND_UPDATED,
  EventTypes.CUSTOMER_CREATED,
  EventTypes.CUSTOMER_UPDATED,
])

/** Live queue: everything except EOD-only sales/customer events. */
export function shouldEnqueueLiveSheetSync(eventType: EventType): boolean {
  return !EOD_ONLY_SHEET_EVENTS.has(eventType)
}
