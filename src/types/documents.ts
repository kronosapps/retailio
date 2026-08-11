/**
 * Firestore document contracts for RetailOS.
 * Every persisted entity extends BaseDocument.
 */

export type UserRole = "admin" | "manager" | "cashier"

/** Shared fields required on every Firestore document. */
export interface BaseDocument {
  id: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export interface Invoice extends BaseDocument {
  invoiceNumber: string
  storeId: string | null
  customerId: string | null
  customerName: string
  /** Payable total in paisa */
  totalPaisa: number
  paymentStatus:
    | "Pending"
    | "Paid"
    | "Failed"
    | "Cancelled"
    | "Expired"
    | "Refunded"
    | null
  paymentId: string | null
  paymentMethod: string | null
  customerPhone?: string | null
  lines: unknown[]
  totals: Record<string, unknown>
}

export interface Payment extends BaseDocument {
  paymentId: string
  invoiceId: string
  invoiceNumber: string
  transactionReference: string
  amount: number
  amountPaisa: number
  currency: string
  paymentMethod: string
  status:
    | "Pending"
    | "Paid"
    | "Failed"
    | "Cancelled"
    | "Expired"
    | "Refunded"
  paidAt: string | null
  merchantUPI?: string
  merchantName?: string
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
  /** Last 4 digits of UPI txn id (customer phone) */
  upiTxnLast4?: string | null
  /** Daily cash slip sequence */
  cashReceiptNumber?: number | null
  cashReceiptId?: string | null
}

export interface Customer extends BaseDocument {
  name: string
  phone?: string
  email?: string
  notes?: string
  storeId: string | null
  totalSpendPaisa?: number
  visitCount?: number
  lastPurchaseAt?: string | null
}

export interface Refund extends BaseDocument {
  refundId: string
  invoiceId: string
  paymentId: string | null
  customerId: string | null
  customerName: string
  amountPaisa: number
  amount: number
  method: string
  reason: string
  restock: boolean
  status: "Completed" | "Cancelled"
  storeId: string | null
}

export interface Supplier extends BaseDocument {
  name: string
  phone?: string
  email?: string
  storeId: string | null
}

export interface InventoryItem extends BaseDocument {
  productId: string
  sku?: string
  name: string
  quantity: number
  unit?: string
  storeId: string | null
}

export interface Expense extends BaseDocument {
  title: string
  amountPaisa: number
  category?: string
  storeId: string | null
  note?: string
}

export interface User extends BaseDocument {
  email: string
  username: string
  displayName: string
  role: UserRole
  storeId: string
  active: boolean
}

export interface Product extends BaseDocument {
  /** Parent product group id (e.g. PID-MH-BL-001); variants share this */
  productId: string
  /** Unique sellable SKU — also used as Firestore document id */
  sku: string
  barcode: string | null
  name: string
  category: string
  brand: string | null
  unitSize: number
  unit: string
  gstRate: number
  cgst: number
  sgst: number
  hsnCode: string | null
  purchasePricePaisa: number | null
  sellingPricePaisa: number
  mrpPaisa: number | null
  purchasePrice: number | null
  sellingPrice: number
  mrp: number | null
  reorderLevel?: number
  storeId: string | null
  active: boolean
}

export interface SettingsDoc extends BaseDocument {
  storeId: string
  key: string
  value: unknown
}

export interface SyncEvent extends BaseDocument {
  eventType: string
  payload: unknown
  status: string
  retries: number
  error: string | null
}
