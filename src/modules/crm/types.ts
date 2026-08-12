/**
 * CRM domain types — profile aggregates for retail customer management.
 */

import type { CustomerRecord } from "@/data/customers"
import type { CreditNoteRecord } from "@/data/creditNotes"
import type { CouponRecord } from "@/modules/pricing/types"
import type { Paisa } from "@/lib/money"

export type CustomerSegmentId =
  | "new"
  | "regular"
  | "vip"
  | "at_risk"
  | "credit_holder"
  | "loyalty_ready"

export type CustomerSegment = {
  id: CustomerSegmentId
  label: string
}

export type CrmPurchaseRow = {
  invoiceId: string
  createdAt: string
  totalPaisa: Paisa
  paymentStatus: string | null
  paymentMethod: string | null
  itemCount: number
}

export type CrmCommunicationRow = {
  notificationId: string
  createdAt: string
  channel: string
  status: string
  messageType: string
  invoiceId: string
  error: string | null
}

export type CrmProfile = {
  customer: CustomerRecord
  segments: CustomerSegment[]
  /** Lifetime paid spend (from customer record). */
  lifetimeSpendPaisa: Paisa
  visitCount: number
  /** Manual AR + unpaid invoice totals. */
  outstandingPaisa: Paisa
  unpaidInvoicesPaisa: Paisa
  storeCreditPaisa: Paisa
  loyaltyPunches: number
  punchesRequired: number
  loyaltyPoints: number
  purchases: CrmPurchaseRow[]
  creditNotes: CreditNoteRecord[]
  communications: CrmCommunicationRow[]
  /** Active store coupons (not customer-targeted yet). */
  openOffers: CouponRecord[]
  offerNote: string | null
}

export type RecordPurchaseLoyaltyInput = {
  customerId: string
  purchasePaisa: number
  /** True when this sale redeemed punch % or free item. */
  redeemedLoyalty?: boolean
  /** Points spent on this sale (deducted after earn). */
  pointsRedeemed?: number
  actorId?: string | null
}
