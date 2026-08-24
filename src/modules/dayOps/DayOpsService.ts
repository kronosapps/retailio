import {
  dayKeyFromDate,
  isInRange,
  isoDateFromDate,
  resolveDashboardRange,
} from "@/modules/dashboard/services/dateRanges"
import { BankingService } from "@/modules/banking"
import { ExpenseService } from "@/modules/expense/ExpenseService"
import { InventoryService } from "@/modules/inventory"
import { StockTakeService } from "@/modules/inventory/StockTakeService"
import { PurchaseOrderService, remainingQty } from "@/modules/purchasing/PurchaseOrderService"
import { EndOfDayService } from "@/modules/reports/EndOfDayService"
import { saleDiscountPaisa } from "@/modules/reporting/utils/report-calculations"
import { ShiftService } from "@/modules/shift"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { businessDayRepository } from "@/repositories/BusinessDayRepository"
import { createId } from "@/utils/id"
import { paisaToRupees } from "@/lib/money"

import type {
  BusinessDayRecord,
  CloseDayInput,
  DayCashierVarianceRow,
  DayClosingPreview,
  DayOpsDayRef,
  DayStockException,
  OpenDayInput,
  ReopenDayInput,
  SodChecklist,
  SuggestedOpenings,
} from "./types"

export class DayOpsError extends Error {
  code: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: DayOpsError["code"], message: string) {
    super(message)
    this.name = "DayOpsError"
    this.code = code
  }
}

function filterStore<T extends { storeId?: string | null }>(
  items: T[],
  storeId: string | null
): T[] {
  if (!storeId) return items
  return items.filter((i) => !i.storeId || i.storeId === storeId)
}

function emptyChecklist(): SodChecklist {
  return {
    bankingVerified: false,
    floatReady: false,
    printersOk: false,
    upiQrOk: false,
  }
}

function mergeChecklist(
  partial?: Partial<SodChecklist> | null
): SodChecklist {
  return { ...emptyChecklist(), ...partial }
}

/**
 * Store day operations — Open Day → Operate → Close Day.
 * Shift = cashier till; Banking = cashbook; EndOfDayService = Sheets export.
 */
export class DayOpsService {
  static dayKeyToday(): string {
    return dayKeyFromDate(new Date())
  }

  static list(storeId?: string | null): BusinessDayRecord[] {
    const all = businessDayRepository.list()
    if (!storeId) return all
    return all.filter((d) => !d.storeId || d.storeId === storeId)
  }

  static getOpen(storeId?: string | null): BusinessDayRecord | null {
    return businessDayRepository.getOpen(storeId ?? null)
  }

  static getByDayKey(
    dayKey: string,
    storeId?: string | null
  ): BusinessDayRecord | null {
    return businessDayRepository.getByDayKey(dayKey, storeId ?? null)
  }

  static hydrate() {
    return businessDayRepository.hydrate()
  }

  /** Soft-gate helper for POS — true when today's business day is OPEN. */
  static isStoreDayOpen(storeId?: string | null): boolean {
    const open = this.getOpen(storeId ?? null)
    if (!open) return false
    return open.dayKey === this.dayKeyToday()
  }

  /**
   * Suggested SOD openings: prefer yesterday's frozen banking close,
   * else live banking balances.
   */
  static getSuggestedOpenings(
    storeId: string | null = null
  ): SuggestedOpenings {
    const yesterday = resolveDashboardRange("yesterday")
    const yKey = dayKeyFromDate(yesterday.start)
    const prior = this.getByDayKey(yKey, storeId)
    if (
      prior?.status === "CLOSED" &&
      prior.closingSnapshot &&
      (prior.closingSnapshot.bankingClosingCashPaisa != null ||
        prior.closingSnapshot.bankingClosingUpiPaisa != null)
    ) {
      return {
        cashPaisa: prior.closingSnapshot.bankingClosingCashPaisa,
        upiPaisa: prior.closingSnapshot.bankingClosingUpiPaisa,
        source: "yesterday_close",
        sourceLabel: `Yesterday close (${prior.date})`,
      }
    }
    const banking = BankingService.getSnapshot()
    return {
      cashPaisa: banking.balances.cashPaisa,
      upiPaisa: banking.balances.upiPaisa,
      source: "banking",
      sourceLabel: "Current banking balances",
    }
  }

  /** Start of Day — open today's business day. */
  static async openDay(input: OpenDayInput = {}): Promise<BusinessDayRecord> {
    const storeId = input.storeId ?? null
    const range = resolveDashboardRange("today")
    const dayKey = dayKeyFromDate(range.start)

    const existingOpen = this.getOpen(storeId)
    if (existingOpen) {
      if (existingOpen.dayKey === dayKey) return existingOpen
      throw new DayOpsError(
        "CONFLICT",
        `Day ${existingOpen.date} is still open. Close it before opening a new day.`
      )
    }

    const already = this.getByDayKey(dayKey, storeId)
    if (already?.status === "CLOSED" && !input.force) {
      throw new DayOpsError(
        "CONFLICT",
        `Day ${already.date} is already closed. Use Re-open day (admin) instead.`
      )
    }

    const suggested = this.getSuggestedOpenings(storeId)
    const now = new Date().toISOString()
    const record: BusinessDayRecord = {
      id: already?.id || createId("day"),
      dayKey,
      date: isoDateFromDate(range.start),
      label: range.label,
      status: "OPEN",
      storeId,
      openedAt: now,
      openedBy: input.actorId ?? null,
      openedByName: input.actorName ?? null,
      openingCashPaisa:
        typeof input.openingCashPaisa === "number"
          ? Math.max(0, Math.round(input.openingCashPaisa))
          : suggested.cashPaisa,
      openingUpiPaisa:
        typeof input.openingUpiPaisa === "number"
          ? Math.max(0, Math.round(input.openingUpiPaisa))
          : suggested.upiPaisa,
      openNotes: input.notes?.trim() || null,
      sodChecklist: mergeChecklist(input.checklist),
      closedAt: null,
      closedBy: null,
      closedByName: null,
      closeNotes: null,
      countedCashPaisa: null,
      closingSnapshot: null,
      sheetsSync: null,
      reopenedAt: already?.reopenedAt ?? null,
      reopenedBy: already?.reopenedBy ?? null,
      reopenedByName: already?.reopenedByName ?? null,
      reopenReason: already?.reopenReason ?? null,
      createdAt: already?.createdAt || now,
      updatedAt: now,
    }

    const saved = await businessDayRepository.save(record)
    await EventPublisher.publish(EventTypes.DAY_OPENED, saved, storeId)
    return saved
  }

  /** Admin-only reopen of a CLOSED day (audited). */
  static async reopenDay(input: ReopenDayInput): Promise<BusinessDayRecord> {
    const reason = input.reason?.trim()
    if (!reason || reason.length < 3) {
      throw new DayOpsError(
        "VALIDATION",
        "Re-open reason is required (min 3 characters)."
      )
    }
    const storeId = input.storeId ?? null
    const existingOpen = this.getOpen(storeId)
    if (existingOpen) {
      throw new DayOpsError(
        "CONFLICT",
        `Close open day ${existingOpen.date} before re-opening another.`
      )
    }
    const day = this.getByDayKey(input.dayKey, storeId)
    if (!day) throw new DayOpsError("NOT_FOUND", "Business day not found.")
    if (day.status !== "CLOSED") {
      throw new DayOpsError("INVALID_STATUS", "Only closed days can be re-opened.")
    }

    const now = new Date().toISOString()
    const next: BusinessDayRecord = {
      ...day,
      status: "OPEN",
      closedAt: null,
      closedBy: null,
      closedByName: null,
      closeNotes: null,
      countedCashPaisa: null,
      closingSnapshot: null,
      sheetsSync: null,
      reopenedAt: now,
      reopenedBy: input.actorId ?? null,
      reopenedByName: input.actorName ?? null,
      reopenReason: reason,
      openedAt: now,
      openedBy: input.actorId ?? null,
      openedByName: input.actorName ?? null,
      updatedAt: now,
    }
    const saved = await businessDayRepository.save(next)
    await EventPublisher.publish(EventTypes.DAY_REOPENED, saved, storeId)
    return saved
  }

  /** Live or closing preview for a calendar day ref. */
  static async getClosingPreview(
    day: DayOpsDayRef = "today",
    storeId: string | null = null
  ): Promise<DayClosingPreview> {
    const range = resolveDashboardRange(day)
    const dayKey = dayKeyFromDate(range.start)
    const start = range.start
    const end = range.end

    const [invoices, payments, refunds] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
      refundRepository.list(),
    ])

    const sales = filterStore(invoices, storeId).filter((s) =>
      isInRange(s.createdAt, start, end)
    )
    const dayPayments = payments.filter((p) => {
      if (p.status === "Cancelled" || p.status === "Expired") return false
      const when = p.paidAt || p.createdAt
      return isInRange(when, start, end)
    })
    const dayRefunds = filterStore(refunds, storeId).filter((r) =>
      isInRange(r.createdAt, start, end)
    )

    const paidSales = sales.filter(
      (s) => s.paymentStatus === "Paid" || s.paymentStatus === "Refunded"
    )
    const paidPayments = dayPayments.filter((p) => p.status === "Paid")
    const completedRefunds = dayRefunds.filter((r) => r.status === "Completed")

    let cashIn = 0
    let upiIn = 0
    let onAccount = 0
    for (const p of paidPayments) {
      if (p.paymentMethod === "Cash") cashIn += p.amountPaisa
      else if (p.paymentMethod === "UPI") upiIn += p.amountPaisa
      else if (p.paymentMethod === "OnAccount") onAccount += p.amountPaisa
    }

    let cashRefunds = 0
    let upiRefunds = 0
    const refundByMethod = new Map<
      string,
      { count: number; totalPaisa: number }
    >()
    for (const r of completedRefunds) {
      const method = r.method || "Unknown"
      const cur = refundByMethod.get(method) || { count: 0, totalPaisa: 0 }
      cur.count += 1
      cur.totalPaisa += r.amountPaisa
      refundByMethod.set(method, cur)
      if (method === "Cash") cashRefunds += r.amountPaisa
      else if (method === "UPI") upiRefunds += r.amountPaisa
    }

    let discountsPaisa = 0
    let discountInvoices = 0
    for (const s of sales) {
      const d = saleDiscountPaisa(s)
      if (d > 0) {
        discountsPaisa += d
        discountInvoices += 1
      }
    }

    const expenses = ExpenseService.list().filter((e) => {
      if (storeId && e.storeId && e.storeId !== storeId) return false
      return isInRange(e.createdAt, start, end)
    })
    const expenseByMethod = new Map<string, number>()
    let expenseTotal = 0
    for (const e of expenses) {
      expenseTotal += e.amountPaisa
      const m = e.paymentMethod || "Cash"
      expenseByMethod.set(m, (expenseByMethod.get(m) || 0) + e.amountPaisa)
    }

    const stockTakes = StockTakeService.list().filter((t) => {
      if (t.status !== "POSTED") return false
      if (storeId && t.storeId && t.storeId !== storeId) return false
      const at = t.postedAt || t.updatedAt
      return isInRange(at, start, end)
    })
    const stockExceptions: DayStockException[] = stockTakes
      .map((t) => ({
        id: t.id,
        label: t.takeNumber,
        kind: "stock_take" as const,
        varianceLines: t.lines.filter((l) => l.varianceQty !== 0).length,
        at: t.postedAt || t.updatedAt,
      }))
      .filter((x) => x.varianceLines > 0)

    for (const m of inventoryMovementRepository.list()) {
      if (storeId && m.storeId && m.storeId !== storeId) continue
      if (!isInRange(m.createdAt, start, end)) continue
      if (
        m.type !== "DAMAGE" &&
        m.type !== "WASTAGE" &&
        m.type !== "ADJUSTMENT_OUT" &&
        m.type !== "ADJUSTMENT_IN"
      ) {
        continue
      }
      stockExceptions.push({
        id: m.id,
        label: `${m.type} · ${m.sku}`,
        kind: "movement",
        varianceLines: 1,
        at: m.createdAt,
      })
    }

    for (const row of InventoryService.getAllStock({ includeInactive: false })) {
      if (row.quantity >= 0) continue
      stockExceptions.push({
        id: `neg_${row.sku}`,
        label: `Negative stock · ${row.sku} (${row.quantity})`,
        kind: "negative_stock",
        varianceLines: 1,
        at: row.updatedAt || new Date().toISOString(),
      })
    }

    for (const po of PurchaseOrderService.listOpenForReceiving()) {
      if (storeId && po.storeId && po.storeId !== storeId) continue
      const remaining = po.lines.reduce((s, l) => s + remainingQty(l), 0)
      if (remaining <= 0) continue
      stockExceptions.push({
        id: po.id,
        label: `Open PO ${po.poNumber || po.id} · ${remaining} qty pending GRN`,
        kind: "open_po",
        varianceLines: po.lines.filter((l) => remainingQty(l) > 0).length,
        at: po.updatedAt || po.createdAt,
      })
    }

    const shifts = ShiftService.list().filter((s) => {
      if (storeId && s.storeId && s.storeId !== storeId) return false
      const when = s.openedAt
      return isInRange(when, start, end) || s.status === "OPEN"
    })
    const cashierVariance: DayCashierVarianceRow[] = shifts.map((s) => {
      const b = ShiftService.expectedBreakdown(s)
      return {
        shiftId: s.id,
        shiftNumber: s.shiftNumber,
        cashierName: s.cashierName || s.cashierId,
        cashierId: s.cashierId,
        status: s.status,
        expectedCashPaisa: b.expectedCashPaisa,
        actualCashPaisa: b.actualCashPaisa,
        variancePaisa: b.variancePaisa,
      }
    })
    const openShiftsCount = cashierVariance.filter(
      (r) => r.status === "OPEN"
    ).length

    const banking = BankingService.getSnapshot()
    const warnings: string[] = []
    if (openShiftsCount > 0) {
      warnings.push(
        `${openShiftsCount} cashier shift(s) still open — close tills below or on Shifts.`
      )
    }
    const openDay = this.getOpen(storeId)
    if (day === "today" && !openDay) {
      warnings.push(
        "Business day is not open. Open Day to start the operational boundary."
      )
    }
    if (day === "today" && openDay && openDay.dayKey !== dayKey) {
      warnings.push(
        `Open day is ${openDay.date}, not today — close the prior day first.`
      )
    }

    return {
      dayKey,
      date: isoDateFromDate(start),
      label: range.label,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      sales: {
        invoiceCount: sales.length,
        paidInvoiceCount: paidSales.length,
        salesTotalPaisa: sales.reduce((s, x) => s + (x.totals?.total || 0), 0),
        paidSalesPaisa: paidSales.reduce(
          (s, x) => s + (x.totals?.total || 0),
          0
        ),
      },
      cash: {
        inPaisa: cashIn,
        refundsPaisa: cashRefunds,
        netPaisa: cashIn - cashRefunds,
      },
      upi: {
        inPaisa: upiIn,
        refundsPaisa: upiRefunds,
        netPaisa: upiIn - upiRefunds,
      },
      tenders: {
        cashInPaisa: cashIn,
        cashOutRefundsPaisa: cashRefunds,
        upiInPaisa: upiIn,
        upiOutRefundsPaisa: upiRefunds,
        onAccountPaisa: onAccount,
        paymentCount: paidPayments.length,
      },
      refunds: {
        count: completedRefunds.length,
        totalPaisa: completedRefunds.reduce((s, r) => s + r.amountPaisa, 0),
        byMethod: [...refundByMethod.entries()].map(([method, v]) => ({
          method,
          count: v.count,
          totalPaisa: v.totalPaisa,
        })),
      },
      discounts: {
        invoiceCountWithDiscount: discountInvoices,
        totalDiscountPaisa: discountsPaisa,
      },
      expenses: {
        count: expenses.length,
        totalPaisa: expenseTotal,
        byMethod: [...expenseByMethod.entries()].map(
          ([method, totalPaisa]) => ({
            method,
            totalPaisa,
          })
        ),
      },
      stockExceptions,
      cashierVariance,
      openShiftsCount,
      bankingClosingCashPaisa: banking.balances.cashPaisa,
      bankingClosingUpiPaisa: banking.balances.upiPaisa,
      warnings,
    }
  }

  /** End of Day — freeze snapshot, optional Sheets sync, mark CLOSED. */
  static async closeDay(
    input: CloseDayInput = {}
  ): Promise<{ day: BusinessDayRecord; preview: DayClosingPreview }> {
    const storeId = input.storeId ?? null
    const open = this.getOpen(storeId)
    if (!open) {
      throw new DayOpsError(
        "INVALID_STATUS",
        "No open business day. Open Day first."
      )
    }

    const todayKey = this.dayKeyToday()
    const dayRef: DayOpsDayRef =
      open.dayKey === todayKey ? "today" : "yesterday"
    const preview = await this.getClosingPreview(dayRef, storeId)

    if (preview.openShiftsCount > 0 && !input.allowOpenShifts) {
      throw new DayOpsError(
        "CONFLICT",
        `${preview.openShiftsCount} cashier shift(s) still open. Close them below or confirm allow open shifts.`
      )
    }

    let sheetsSync: BusinessDayRecord["sheetsSync"] = {
      ran: false,
      ranAt: null,
      errors: [],
    }
    const shouldSync =
      input.syncSheets !== false && EndOfDayService.isSheetsConfigured()
    if (shouldSync) {
      const result = await EndOfDayService.run(dayRef, storeId, {
        closingPreview: preview,
      })
      sheetsSync = {
        ran: true,
        ranAt: result.ranAt,
        errors: result.errors,
      }
    } else if (input.syncSheets && !EndOfDayService.isSheetsConfigured()) {
      sheetsSync = {
        ran: false,
        ranAt: null,
        errors: [
          "Google Sheets is not configured — close completed without sync.",
        ],
      }
    }

    const now = new Date().toISOString()
    const closed: BusinessDayRecord = {
      ...open,
      status: "CLOSED",
      closedAt: now,
      closedBy: input.actorId ?? null,
      closedByName: input.actorName ?? null,
      closeNotes: input.notes?.trim() || null,
      countedCashPaisa:
        typeof input.countedCashPaisa === "number"
          ? Math.round(input.countedCashPaisa)
          : null,
      closingSnapshot: preview,
      sheetsSync,
      updatedAt: now,
    }

    const saved = await businessDayRepository.save(closed)
    await EventPublisher.publish(EventTypes.DAY_CLOSED, saved, storeId)
    return { day: saved, preview }
  }

  /** Sheets-only re-sync without changing day status (advanced / Options). */
  static async syncSheetsOnly(
    day: DayOpsDayRef = "today",
    storeId: string | null = null
  ) {
    const preview = await this.getClosingPreview(day, storeId)
    return EndOfDayService.run(day, storeId, { closingPreview: preview })
  }

  /** Rupee helpers for UI forms. */
  static paisaToRupeesInput(paisa: number): string {
    return String(paisaToRupees(paisa))
  }
}
