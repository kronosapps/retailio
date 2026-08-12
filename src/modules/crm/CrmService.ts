import {
  normalizeCustomerPhone,
  type CustomerRecord,
} from "@/data/customers"
import { listRecordedSales, type RecordedSale } from "@/data/invoices"
import {
  getEffectiveLoyalty,
  pointsFromSpendPaisa,
  loyaltyConfig,
} from "@/data/loyalty"
import { isSalePunchEligible } from "@/data/promoSettings"
import type { CrmAuditRecord } from "@/data/crmAudit"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { NotificationService } from "@/modules/notifications"
import { PricingService } from "@/modules/pricing"
import type { CouponRecord } from "@/modules/pricing/types"
import { creditNoteRepository } from "@/repositories/CreditNoteRepository"
import { crmAuditRepository } from "@/repositories/CrmAuditRepository"
import { customerRepository } from "@/repositories/CustomerRepository"
import { createId } from "@/utils/id"

import type {
  CrmCommunicationRow,
  CrmProfile,
  CrmPurchaseRow,
  CustomerSegment,
  CustomerSegmentId,
  RecordPurchaseLoyaltyInput,
  RecordPurchaseLoyaltyResult,
} from "./types"

export class CrmError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INSUFFICIENT"

  constructor(code: CrmError["code"], message: string) {
    super(message)
    this.name = "CrmError"
    this.code = code
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

function saleMatchesCustomer(sale: RecordedSale, customer: CustomerRecord) {
  if (sale.customerId && sale.customerId === customer.id) return true
  const phone = normalizeCustomerPhone(customer.phone)
  const salePhone = normalizeCustomerPhone(sale.customerPhone)
  if (phone && salePhone && phone === salePhone) return true
  return false
}

function isUnpaidStatus(status: string | null | undefined) {
  if (!status) return true
  return status === "Pending" || status === "Expired" || status === "Failed"
}

function formatPaisa(paisa: number) {
  return `₹${(paisa / 100).toFixed(2)}`
}

/**
 * Customer CRM — profile aggregates, store credit apply, loyalty punches/points.
 * UI → CrmService → repositories (never Firestore from React).
 */
export class CrmService {
  /** Hydrate CRM cloud deps when Firestore is source of truth. */
  static async hydrateDeps(): Promise<void> {
    await Promise.all([
      customerRepository.hydrate(),
      creditNoteRepository.hydrate(),
      NotificationService.hydrate(),
      crmAuditRepository.hydrate(),
    ])
  }

  static listAudit(customerId: string): CrmAuditRecord[] {
    return crmAuditRepository.list(customerId)
  }

  static deriveSegments(customer: CustomerRecord): CustomerSegment[] {
    const segs = loyaltyConfig.segments
    const vipMin = segs?.vipMinSpendPaisa ?? 2_500_000
    const regularMin = segs?.regularMinVisits ?? 5
    const atRiskDays = segs?.atRiskDays ?? 60
    const out: CustomerSegment[] = []

    if (customer.visitCount <= 1) {
      out.push({ id: "new", label: "New" })
    }
    if (customer.visitCount >= regularMin) {
      out.push({ id: "regular", label: "Regular" })
    }
    if (customer.totalSpendPaisa >= vipMin) {
      out.push({ id: "vip", label: "VIP" })
    }
    const idle = daysSince(customer.lastPurchaseAt)
    if (
      customer.visitCount > 0 &&
      idle != null &&
      idle >= atRiskDays
    ) {
      out.push({ id: "at_risk", label: "At risk" })
    }
    if (customer.storeCreditPaisa > 0) {
      out.push({ id: "credit_holder", label: "Store credit" })
    }
    if (customer.loyaltyPunches >= getEffectiveLoyalty().punchesRequired) {
      out.push({ id: "loyalty_ready", label: "Loyalty ready" })
    }
    return out
  }

  static listPurchaseHistory(customerId: string): CrmPurchaseRow[] {
    const customer = customerRepository.getById(customerId)
    if (!customer) return []
    return listRecordedSales()
      .filter((sale) => saleMatchesCustomer(sale, customer))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((sale) => ({
        invoiceId: sale.invoiceId,
        createdAt: sale.createdAt,
        totalPaisa: sale.totals.total,
        paymentStatus: sale.paymentStatus ?? null,
        paymentMethod: sale.paymentMethod ?? null,
        itemCount: sale.lines.reduce((s, l) => s + l.qty, 0),
      }))
  }

  static unpaidInvoicesPaisa(customerId: string): number {
    const customer = customerRepository.getById(customerId)
    if (!customer) return 0
    return listRecordedSales()
      .filter(
        (sale) =>
          saleMatchesCustomer(sale, customer) &&
          isUnpaidStatus(sale.paymentStatus)
      )
      .reduce((s, sale) => s + (sale.totals.total || 0), 0)
  }

  static listCommunications(customerId: string): CrmCommunicationRow[] {
    return NotificationService.list()
      .filter((n) => n.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((n) => ({
        notificationId: n.notificationId,
        createdAt: n.createdAt,
        channel: n.channel,
        status: n.status,
        messageType: n.messageType,
        invoiceId: n.invoiceId,
        error: n.error,
      }))
  }

  static getProfile(customerId: string): CrmProfile | null {
    const customer = customerRepository.getById(customerId)
    if (!customer) return null
    const unpaid = this.unpaidInvoicesPaisa(customerId)
    const openOffers = customerId
      ? this.listEligibleCoupons(customerId)
      : PricingService.listCoupons().filter((c) => {
          const today = new Date().toISOString().slice(0, 10)
          return c.active && c.startsOn <= today && c.endsOn >= today
        })
    return {
      customer,
      segments: this.deriveSegments(customer),
      lifetimeSpendPaisa: customer.totalSpendPaisa,
      visitCount: customer.visitCount,
      outstandingPaisa: customer.outstandingPaisa + unpaid,
      unpaidInvoicesPaisa: unpaid,
      storeCreditPaisa: customer.storeCreditPaisa,
      loyaltyPunches: customer.loyaltyPunches,
      punchesRequired: getEffectiveLoyalty().punchesRequired,
      loyaltyPoints: customer.loyaltyPoints,
      purchases: this.listPurchaseHistory(customerId),
      creditNotes: creditNoteRepository
        .list()
        .filter((c) => c.customerId === customerId),
      communications: this.listCommunications(customerId),
      openOffers,
      offerNote: customer.offerNote,
      audit: this.listAudit(customerId).slice(0, 100),
    }
  }

  static async updateProfile(input: {
    id: string
    name?: string
    phone?: string
    email?: string
    notes?: string
    gstin?: string
    address?: string
    city?: string
    state?: string
    pin?: string
    birthday?: string | null
    preferences?: string | null
    tags?: string[]
    offerNote?: string | null
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.id)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (input.name != null && !input.name.trim()) {
      throw new CrmError("VALIDATION", "Name is required.")
    }
    const next = await customerRepository.save(
      {
        ...existing,
        name: input.name?.trim() || existing.name,
        phone:
          input.phone === undefined
            ? existing.phone
            : normalizeCustomerPhone(input.phone) ?? undefined,
        email:
          input.email === undefined
            ? existing.email
            : input.email.trim() || undefined,
        notes:
          input.notes === undefined
            ? existing.notes
            : input.notes.trim() || undefined,
        gstin:
          input.gstin === undefined
            ? existing.gstin
            : input.gstin.trim().toUpperCase() || undefined,
        address:
          input.address === undefined
            ? existing.address
            : input.address.trim() || undefined,
        city:
          input.city === undefined
            ? existing.city
            : input.city.trim() || undefined,
        state:
          input.state === undefined
            ? existing.state
            : input.state.trim() || undefined,
        pin:
          input.pin === undefined
            ? existing.pin
            : input.pin.trim() || undefined,
        birthday:
          input.birthday === undefined
            ? existing.birthday
            : input.birthday?.trim().slice(0, 10) || null,
        preferences:
          input.preferences === undefined
            ? existing.preferences
            : input.preferences?.trim() || null,
        tags:
          input.tags === undefined
            ? existing.tags
            : input.tags.map((t) => t.trim()).filter(Boolean),
        offerNote:
          input.offerNote === undefined
            ? existing.offerNote
            : input.offerNote?.trim() || null,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "PROFILE_UPDATED",
      message: "Profile updated",
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  static async adjustOutstanding(input: {
    customerId: string
    /** Absolute outstanding AR (charge account), not unpaid invoices. */
    outstandingPaisa: number
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (!Number.isFinite(input.outstandingPaisa) || input.outstandingPaisa < 0) {
      throw new CrmError("VALIDATION", "Outstanding must be ≥ 0.")
    }
    const target = Math.round(input.outstandingPaisa)
    const delta = target - existing.outstandingPaisa
    const next = await customerRepository.save(
      {
        ...existing,
        outstandingPaisa: target,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "AR_ADJUSTED",
      message: `Charge-account AR set to ${formatPaisa(target)}`,
      delta,
      balanceAfter: next.outstandingPaisa,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  /**
   * Apply store credit FIFO against open credit notes.
   * Returns amount actually applied.
   */
  static async applyStoreCredit(input: {
    customerId: string
    amountPaisa: number
    invoiceId?: string | null
    actorId?: string | null
  }): Promise<{ appliedPaisa: number; customer: CustomerRecord }> {
    const customer = customerRepository.getById(input.customerId)
    if (!customer) throw new CrmError("NOT_FOUND", "Customer not found.")

    const want = Math.max(0, Math.round(input.amountPaisa))
    if (want <= 0) {
      return { appliedPaisa: 0, customer }
    }
    const available = Math.min(want, customer.storeCreditPaisa)
    if (available <= 0) {
      throw new CrmError("INSUFFICIENT", "No store credit available.")
    }

    let remaining = available
    const openNotes = creditNoteRepository.listOpenForCustomer(customer.id)
    for (const note of openNotes) {
      if (remaining <= 0) break
      const take = Math.min(remaining, note.balancePaisa)
      if (take <= 0) continue
      const balancePaisa = note.balancePaisa - take
      const status = balancePaisa <= 0 ? "APPLIED" : "OPEN"
      await creditNoteRepository.save({
        ...note,
        balancePaisa,
        status,
        appliedAt:
          status === "APPLIED" ? new Date().toISOString() : note.appliedAt,
      })
      await EventPublisher.publish(
        EventTypes.CREDIT_NOTE_APPLIED,
        {
          id: note.id,
          creditNoteNumber: note.creditNoteNumber,
          customerId: customer.id,
          customerName: customer.name,
          amountPaisa: take,
          invoiceId: input.invoiceId ?? null,
          storeId: customer.storeId,
        },
        customer.storeId
      )
      remaining -= take
    }

    const next = await customerRepository.save(
      {
        ...customer,
        storeCreditPaisa: Math.max(0, customer.storeCreditPaisa - available),
        updatedBy: input.actorId ?? customer.updatedBy,
      },
      false
    )

    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "STORE_CREDIT_APPLIED",
      message: `Applied ${formatPaisa(available)} store credit${
        input.invoiceId ? ` on ${input.invoiceId}` : ""
      }`,
      delta: -available,
      balanceAfter: next.storeCreditPaisa,
      referenceId: input.invoiceId ?? null,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })

    return { appliedPaisa: available, customer: next }
  }

  /** Void an open credit note and reverse unused store credit. */
  static async voidCreditNote(input: {
    creditNoteId: string
    actorId?: string | null
    reason?: string | null
  }) {
    const note = creditNoteRepository.getById(input.creditNoteId)
    if (!note) throw new CrmError("NOT_FOUND", "Credit note not found.")
    if (note.status === "VOID") {
      throw new CrmError("VALIDATION", "Credit note already void.")
    }
    if (note.status === "APPLIED" && note.balancePaisa <= 0) {
      throw new CrmError(
        "VALIDATION",
        "Fully applied credit notes cannot be voided."
      )
    }
    const customer = customerRepository.getById(note.customerId)
    if (!customer) throw new CrmError("NOT_FOUND", "Customer not found.")

    const reverse = Math.max(0, note.balancePaisa)
    const voided = await creditNoteRepository.save({
      ...note,
      status: "VOID",
      balancePaisa: 0,
      reason: input.reason?.trim() || note.reason,
    })

    const next = await customerRepository.save(
      {
        ...customer,
        storeCreditPaisa: Math.max(0, customer.storeCreditPaisa - reverse),
        updatedBy: input.actorId ?? customer.updatedBy,
      },
      false
    )

    await EventPublisher.publish(
      EventTypes.CREDIT_NOTE_VOIDED,
      {
        id: voided.id,
        creditNoteNumber: voided.creditNoteNumber,
        customerId: next.id,
        customerName: next.name,
        amountPaisa: reverse,
        storeId: next.storeId,
      },
      next.storeId
    )

    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "CREDIT_NOTE_VOIDED",
      message: `Voided ${voided.creditNoteNumber} (−${formatPaisa(reverse)})`,
      delta: -reverse,
      balanceAfter: next.storeCreditPaisa,
      referenceId: voided.id,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })

    return { creditNote: voided, customer: next }
  }

  /** Adjust remaining balance on an OPEN credit note (and wallet). */
  static async adjustCreditNote(input: {
    creditNoteId: string
    balancePaisa: number
    actorId?: string | null
  }) {
    const note = creditNoteRepository.getById(input.creditNoteId)
    if (!note) throw new CrmError("NOT_FOUND", "Credit note not found.")
    if (note.status !== "OPEN") {
      throw new CrmError("VALIDATION", "Only open credit notes can be adjusted.")
    }
    if (!Number.isFinite(input.balancePaisa) || input.balancePaisa < 0) {
      throw new CrmError("VALIDATION", "Balance must be ≥ 0.")
    }
    if (input.balancePaisa > note.amountPaisa) {
      throw new CrmError(
        "VALIDATION",
        "Balance cannot exceed original credit amount."
      )
    }
    const customer = customerRepository.getById(note.customerId)
    if (!customer) throw new CrmError("NOT_FOUND", "Customer not found.")

    const target = Math.round(input.balancePaisa)
    const delta = target - note.balancePaisa
    const status = target <= 0 ? "APPLIED" : "OPEN"
    const adjusted = await creditNoteRepository.save({
      ...note,
      balancePaisa: target,
      status,
      appliedAt: status === "APPLIED" ? new Date().toISOString() : note.appliedAt,
    })

    const next = await customerRepository.save(
      {
        ...customer,
        storeCreditPaisa: Math.max(0, customer.storeCreditPaisa + delta),
        updatedBy: input.actorId ?? customer.updatedBy,
      },
      false
    )

    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "CREDIT_NOTE_ADJUSTED",
      message: `Adjusted ${adjusted.creditNoteNumber} to ${formatPaisa(target)}`,
      delta,
      balanceAfter: next.storeCreditPaisa,
      referenceId: adjusted.id,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })

    return { creditNote: adjusted, customer: next }
  }

  /** After Mark Paid — stamps punches (if eligible), earns points, deducts redeemed. */
  static async recordPaidPurchase(
    input: RecordPurchaseLoyaltyInput
  ): Promise<RecordPurchaseLoyaltyResult | null> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) return null

    const spend = Math.max(0, Math.round(input.purchasePaisa || 0))
    const earned = pointsFromSpendPaisa(spend)
    const redeemed = Math.max(0, Math.floor(input.pointsRedeemed || 0))
    const punchesBefore = existing.loyaltyPunches
    const required = getEffectiveLoyalty().punchesRequired
    let punches = punchesBefore
    let punchStamped = false

    if (input.redeemedLoyalty) {
      punches = 0
    } else if (
      isSalePunchEligible({
        purchasePaisa: spend,
        lines: input.lines,
      })
    ) {
      punches = Math.min(required, punches + 1)
      punchStamped = punches > punchesBefore
    }

    const next = await customerRepository.save(
      {
        ...existing,
        loyaltyPunches: punches,
        loyaltyPoints: Math.max(
          0,
          existing.loyaltyPoints + earned - redeemed
        ),
        loyaltyPointsRedeemed:
          (existing.loyaltyPointsRedeemed || 0) + redeemed,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )

    if (earned > 0) {
      await crmAuditRepository.append({
        customerId: next.id,
        customerName: next.name,
        kind: "POINTS_EARNED",
        message: `Earned ${earned} points on purchase`,
        delta: earned,
        balanceAfter: next.loyaltyPoints,
        actorId: input.actorId ?? null,
        storeId: next.storeId,
      })
    }
    if (redeemed > 0) {
      await crmAuditRepository.append({
        customerId: next.id,
        customerName: next.name,
        kind: "POINTS_REDEEMED",
        message: `Redeemed ${redeemed} points`,
        delta: -redeemed,
        balanceAfter: next.loyaltyPoints,
        actorId: input.actorId ?? null,
        storeId: next.storeId,
      })
    }
    if (input.redeemedLoyalty && punchesBefore > 0) {
      await crmAuditRepository.append({
        customerId: next.id,
        customerName: next.name,
        kind: "PUNCHES_RESET",
        message: "Punch card reset after loyalty redeem",
        delta: -punchesBefore,
        balanceAfter: next.loyaltyPunches,
        actorId: input.actorId ?? null,
        storeId: next.storeId,
      })
    } else if (punchStamped) {
      await crmAuditRepository.append({
        customerId: next.id,
        customerName: next.name,
        kind: "PUNCHES_STAMPED",
        message: `Punch stamped (${next.loyaltyPunches}/${required}) — digital = physical card`,
        delta: 1,
        balanceAfter: next.loyaltyPunches,
        actorId: input.actorId ?? null,
        storeId: next.storeId,
      })
    }

    return {
      customer: next,
      punchesBefore,
      punchesAfter: next.loyaltyPunches,
      punchStamped,
      pointsEarned: earned,
      pointsRedeemed: redeemed,
      pointsBalanceAfter: next.loyaltyPoints,
    }
  }

  /**
   * Lost physical punch card — reduce one digital punch (same ledger).
   */
  static async losePhysicalCardPunch(input: {
    customerId: string
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (existing.loyaltyPunches <= 0) {
      throw new CrmError("VALIDATION", "No punches left to remove.")
    }
    const next = await customerRepository.save(
      {
        ...existing,
        loyaltyPunches: existing.loyaltyPunches - 1,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "PUNCHES_ADJUSTED",
      message: "Lost physical punch card (−1 punch)",
      delta: -1,
      balanceAfter: next.loyaltyPunches,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  /**
   * Manual physical-card stamp (in-store punch without a sale) — mirrors digital.
   */
  static async stampPhysicalCard(input: {
    customerId: string
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    const required = getEffectiveLoyalty().punchesRequired
    if (existing.loyaltyPunches >= required) {
      throw new CrmError(
        "VALIDATION",
        "Punch card already full — redeem before stamping."
      )
    }
    const next = await customerRepository.save(
      {
        ...existing,
        loyaltyPunches: existing.loyaltyPunches + 1,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "PUNCHES_STAMPED",
      message: `Physical card stamp synced (${next.loyaltyPunches}/${required})`,
      delta: 1,
      balanceAfter: next.loyaltyPunches,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  /** Charge sale to customer AR (OnAccount tender). */
  static async bumpOutstanding(input: {
    customerId: string
    amountPaisa: number
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    const add = Math.max(0, Math.round(input.amountPaisa))
    const next = await customerRepository.save(
      {
        ...existing,
        outstandingPaisa: existing.outstandingPaisa + add,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    if (add > 0) {
      await crmAuditRepository.append({
        customerId: next.id,
        customerName: next.name,
        kind: "AR_BUMPED",
        message: `On-account charge ${formatPaisa(add)}`,
        delta: add,
        balanceAfter: next.outstandingPaisa,
        actorId: input.actorId ?? null,
        storeId: next.storeId,
      })
    }
    return next
  }

  /**
   * Customer pays down charge-account AR (Cash/UPI).
   * Publishes CUSTOMER_AR_SETTLED for Accounting + Banking.
   */
  static async settleOutstanding(input: {
    customerId: string
    amountPaisa: number
    method: "Cash" | "UPI"
    actorId?: string | null
  }): Promise<{ customer: CustomerRecord; settlementId: string }> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    const amount = Math.max(0, Math.round(input.amountPaisa))
    if (amount <= 0) {
      throw new CrmError("VALIDATION", "Settlement amount must be positive.")
    }
    if (amount > existing.outstandingPaisa) {
      throw new CrmError(
        "INSUFFICIENT",
        "Settlement exceeds charge-account outstanding."
      )
    }
    const settlementId = createId("ars")
    const settledAt = new Date().toISOString()
    const customer = await customerRepository.save(
      {
        ...existing,
        outstandingPaisa: existing.outstandingPaisa - amount,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await EventPublisher.publish(
      EventTypes.CUSTOMER_AR_SETTLED,
      {
        id: settlementId,
        customerId: customer.id,
        customerName: customer.name,
        amountPaisa: amount,
        amount: amount / 100,
        method: input.method,
        paymentMethod: input.method,
        settledAt,
        storeId: customer.storeId,
        actorId: input.actorId ?? null,
      },
      customer.storeId
    )
    await crmAuditRepository.append({
      customerId: customer.id,
      customerName: customer.name,
      kind: "AR_SETTLED",
      message: `Settled ${formatPaisa(amount)} via ${input.method}`,
      delta: -amount,
      balanceAfter: customer.outstandingPaisa,
      referenceId: settlementId,
      actorId: input.actorId ?? null,
      storeId: customer.storeId,
    })
    return { customer, settlementId }
  }

  /** Active coupons the customer may use (segment-aware). */
  static listEligibleCoupons(customerId: string | null): CouponRecord[] {
    const today = new Date().toISOString().slice(0, 10)
    const customer = customerId
      ? customerRepository.getById(customerId)
      : null
    const segs = new Set<string>(
      customer ? this.deriveSegments(customer).map((s) => s.id) : []
    )
    return PricingService.listCoupons().filter((c) => {
      if (!c.active) return false
      if (c.startsOn > today || c.endsOn < today) return false
      if (
        c.maxRedemptions != null &&
        c.redemptionCount >= c.maxRedemptions
      ) {
        return false
      }
      if (!c.segmentScope?.length) return true
      if (!customer) return false
      return c.segmentScope.some((s) => segs.has(s))
    })
  }

  static async adjustLoyaltyPoints(input: {
    customerId: string
    loyaltyPoints: number
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (!Number.isFinite(input.loyaltyPoints) || input.loyaltyPoints < 0) {
      throw new CrmError("VALIDATION", "Points must be ≥ 0.")
    }
    const target = Math.floor(input.loyaltyPoints)
    const delta = target - existing.loyaltyPoints
    const next = await customerRepository.save(
      {
        ...existing,
        loyaltyPoints: target,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "POINTS_ADJUSTED",
      message: `Points set to ${target}`,
      delta,
      balanceAfter: next.loyaltyPoints,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  static async adjustLoyaltyPunches(input: {
    customerId: string
    loyaltyPunches: number
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (!Number.isFinite(input.loyaltyPunches) || input.loyaltyPunches < 0) {
      throw new CrmError("VALIDATION", "Punches must be ≥ 0.")
    }
    const target = Math.min(
      getEffectiveLoyalty().punchesRequired,
      Math.floor(input.loyaltyPunches)
    )
    const delta = target - existing.loyaltyPunches
    const next = await customerRepository.save(
      {
        ...existing,
        loyaltyPunches: target,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
    await crmAuditRepository.append({
      customerId: next.id,
      customerName: next.name,
      kind: "PUNCHES_ADJUSTED",
      message: `Punches set to ${target}`,
      delta,
      balanceAfter: next.loyaltyPunches,
      actorId: input.actorId ?? null,
      storeId: next.storeId,
    })
    return next
  }

  /** Queue offer or reminder WhatsApp for one customer (CRM Comms). */
  static async queueCustomerMessage(input: {
    customerId: string
    messageType: "offer" | "reminder"
    body: string
    actorId?: string | null
  }) {
    const customer = customerRepository.getById(input.customerId)
    if (!customer) throw new CrmError("NOT_FOUND", "Customer not found.")
    const body = input.body.trim()
    if (!body) throw new CrmError("VALIDATION", "Message body is required.")
    if (!customer.phone) {
      throw new CrmError("VALIDATION", "Customer needs a mobile number.")
    }

    const notification = await NotificationService.queue({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      storeId: customer.storeId,
      messageType: input.messageType,
      body,
      forceNew: true,
    })

    await crmAuditRepository.append({
      customerId: customer.id,
      customerName: customer.name,
      kind: "MESSAGE_QUEUED",
      message: `Queued ${input.messageType}: ${body.slice(0, 80)}`,
      referenceId: notification.notificationId,
      actorId: input.actorId ?? null,
      storeId: customer.storeId,
    })

    return notification
  }

  /** Queue campaign message to every customer in a segment (with phone). */
  static async queueSegmentCampaign(input: {
    segmentId: CustomerSegmentId
    body: string
    actorId?: string | null
    storeId?: string | null
  }) {
    const body = input.body.trim()
    if (!body) throw new CrmError("VALIDATION", "Campaign body is required.")

    const recipients = this.listBySegment(input.segmentId).filter((c) =>
      Boolean(c.phone)
    )
    let queued = 0
    for (const customer of recipients) {
      const notification = await NotificationService.queue({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone ?? null,
        storeId: customer.storeId ?? input.storeId ?? null,
        messageType: "campaign",
        body,
        forceNew: true,
      })
      await crmAuditRepository.append({
        customerId: customer.id,
        customerName: customer.name,
        kind: "CAMPAIGN_QUEUED",
        message: `Campaign (${input.segmentId}): ${body.slice(0, 60)}`,
        referenceId: notification.notificationId,
        actorId: input.actorId ?? null,
        storeId: customer.storeId,
      })
      queued += 1
    }
    return { queued, skipped: this.listBySegment(input.segmentId).length - queued }
  }

  /** CSV export for a segment (or all when segmentId is null). */
  static exportSegmentCsv(segmentId: CustomerSegmentId | "all"): string {
    const rows =
      segmentId === "all"
        ? customerRepository.list()
        : this.listBySegment(segmentId)
    const header = [
      "id",
      "name",
      "phone",
      "email",
      "city",
      "visits",
      "spendPaisa",
      "points",
      "pointsRedeemed",
      "storeCreditPaisa",
      "outstandingPaisa",
      "segments",
      "birthday",
    ]
    const lines = [header.join(",")]
    for (const c of rows) {
      const segs = this.deriveSegments(c)
        .map((s) => s.id)
        .join("|")
      lines.push(
        [
          c.id,
          csvEscape(c.name),
          csvEscape(c.phone || ""),
          csvEscape(c.email || ""),
          csvEscape(c.city || ""),
          String(c.visitCount),
          String(c.totalSpendPaisa),
          String(c.loyaltyPoints),
          String(c.loyaltyPointsRedeemed || 0),
          String(c.storeCreditPaisa),
          String(c.outstandingPaisa),
          csvEscape(segs),
          csvEscape(c.birthday || ""),
        ].join(",")
      )
    }
    return lines.join("\n")
  }

  static listBySegment(segmentId: CustomerSegment["id"]): CustomerRecord[] {
    return customerRepository
      .list()
      .filter((c) => this.deriveSegments(c).some((s) => s.id === segmentId))
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
