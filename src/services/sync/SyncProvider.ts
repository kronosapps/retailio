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
  syncProduct(data: unknown): Promise<void>
  syncCustomer(data: unknown): Promise<void>
  syncSupplier(data: unknown): Promise<void>
  syncExpense(data: unknown): Promise<void>
}
