/**
 * Pluggable outbound sync contract.
 * Google Sheets today; Excel / Power BI / Tally later — same interface.
 */
export interface SyncProvider {
  readonly id: string
  readonly name: string

  syncInvoice(data: unknown): Promise<void>
  syncPayment(data: unknown): Promise<void>
  syncInventory(data: unknown): Promise<void>
  syncInventoryMovement?(data: unknown): Promise<void>
  syncProduct(data: unknown): Promise<void>
  syncCategory?(data: unknown): Promise<void>
  syncCustomer(data: unknown): Promise<void>
  syncRefund(data: unknown): Promise<void>
  syncSupplier(data: unknown): Promise<void>
  syncGoodsReceipt?(data: unknown): Promise<void>
  syncExpense(data: unknown): Promise<void>
  /** End-of-day batch: many rows for one sheet in a single request when supported. */
  syncBatch?(sheet: string, rows: unknown[]): Promise<void>
  syncDailyClose?(data: unknown): Promise<void>
}
