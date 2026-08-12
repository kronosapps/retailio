import {
  normalizeCustomerPhone,
  type CustomerRecord,
} from "@/data/customers"
import { listRecordedSales, type RecordedSale } from "@/data/invoices"
import {
  loyaltyConfig,
  pointsFromSpendPaisa,
} from "@/data/loyalty"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { NotificationService } from "@/modules/notifications"
import { PricingService } from "@/modules/pricing"
import { creditNoteRepository } from "@/repositories/CreditNoteRepository"
import { customerRepository } from "@/repositories/CustomerRepository"

import type {
  CrmCommunicationRow,
  CrmProfile,
  CrmPurchaseRow,
  CustomerSegment,
  RecordPurchaseLoyaltyInput,
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

/**
 * Customer CRM — profile aggregates, store credit apply, loyalty punches/points.
 * UI → CrmService → repositories (never Firestore from React).
 */
export class CrmService {
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
    if (customer.loyaltyPunches >= loyaltyConfig.punchesRequired) {
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
    const today = new Date().toISOString().slice(0, 10)
    const openOffers = PricingService.listCoupons().filter(
      (c) => c.active && c.startsOn <= today && c.endsOn >= today
    )
    return {
      customer,
      segments: this.deriveSegments(customer),
      lifetimeSpendPaisa: customer.totalSpendPaisa,
      visitCount: customer.visitCount,
      outstandingPaisa: customer.outstandingPaisa + unpaid,
      unpaidInvoicesPaisa: unpaid,
      storeCreditPaisa: customer.storeCreditPaisa,
      loyaltyPunches: customer.loyaltyPunches,
      punchesRequired: loyaltyConfig.punchesRequired,
      loyaltyPoints: customer.loyaltyPoints,
      purchases: this.listPurchaseHistory(customerId),
      creditNotes: creditNoteRepository
        .list()
        .filter((c) => c.customerId === customerId),
      communications: this.listCommunications(customerId),
      openOffers,
      offerNote: customer.offerNote,
    }
  }

  static async updateProfile(input: {
    id: string
    name?: string
    phone?: string
    email?: string
    notes?: string
    gstin?: string
    tags?: string[]
    offerNote?: string | null
    actorId?: string | null
  }): Promise<CustomerRecord> {
    const existing = customerRepository.getById(input.id)
    if (!existing) throw new CrmError("NOT_FOUND", "Customer not found.")
    if (input.name != null && !input.name.trim()) {
      throw new CrmError("VALIDATION", "Name is required.")
    }
    return customerRepository.save(
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
    return customerRepository.save(
      {
        ...existing,
        outstandingPaisa: Math.round(input.outstandingPaisa),
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
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

    return { appliedPaisa: available, customer: next }
  }

  /** After Mark Paid — stamps punches and earns points. */
  static async recordPaidPurchase(
    input: RecordPurchaseLoyaltyInput
  ): Promise<CustomerRecord | null> {
    const existing = customerRepository.getById(input.customerId)
    if (!existing) return null

    const spend = Math.max(0, Math.round(input.purchasePaisa || 0))
    const earned = pointsFromSpendPaisa(spend)
    let punches = existing.loyaltyPunches
    if (input.redeemedLoyalty) {
      punches = 0
    } else if (spend > 0) {
      punches = Math.min(
        loyaltyConfig.punchesRequired,
        punches + 1
      )
    }

    return customerRepository.save(
      {
        ...existing,
        loyaltyPunches: punches,
        loyaltyPoints: existing.loyaltyPoints + earned,
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
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
    return customerRepository.save(
      {
        ...existing,
        loyaltyPoints: Math.floor(input.loyaltyPoints),
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
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
    return customerRepository.save(
      {
        ...existing,
        loyaltyPunches: Math.min(
          loyaltyConfig.punchesRequired,
          Math.floor(input.loyaltyPunches)
        ),
        updatedBy: input.actorId ?? existing.updatedBy,
      },
      false
    )
  }

  static listBySegment(segmentId: CustomerSegment["id"]): CustomerRecord[] {
    return customerRepository
      .list()
      .filter((c) => this.deriveSegments(c).some((s) => s.id === segmentId))
  }
}
