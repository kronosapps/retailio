import { isInRange, resolveDashboardRange } from "@/modules/dashboard/services/dateRanges"
import { BankingService } from "@/modules/banking"
import { ExpenseService } from "@/modules/expense/ExpenseService"
import { StockTakeService } from "@/modules/inventory/StockTakeService"
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

import type {
  BusinessDayRecord,
  CloseDayInput,
  DayCashierVarianceRow,
  DayClosingPreview,
  DayOpsDayRef,
  OpenDayInput,
} from "./types"

export class DayOpsError extends Error {
  code: "VALIDATION" | "CONFLICT" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: DayOpsError["code"], message: string) {
    super(message)
    this.name = "DayOpsError"
    this.code = code
  }
}

function dayKeyFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function filterStore<T extends { storeId?: string | null }>(
  items: T[],
  storeId: string | null
): T[] {
  if (!storeId) return items
  return items.filter((i) => !i.storeId || i.storeId === storeId)
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
        `Day ${already.date} is already closed. Use force only to reopen deliberately.`
      )
    }

    const banking = BankingService.getSnapshot()
    const now = new Date().toISOString()
    const record: BusinessDayRecord = {
      id: already?.id || createId("day"),
      dayKey,
      date: isoDate(range.start),
      label: range.label,
      status: "OPEN",
      storeId,
      openedAt: now,
      openedBy: input.actorId ?? null,
      openedByName: input.actorName ?? null,
      openingCashPaisa:
        typeof input.openingCashPaisa === "number"
          ? Math.max(0, Math.round(input.openingCashPaisa))
          : banking.balances.cashPaisa,
      openingUpiPaisa:
        typeof input.openingUpiPaisa === "number"
          ? Math.max(0, Math.round(input.openingUpiPaisa))
          : banking.balances.upiPaisa,
      openNotes: input.notes?.trim() || null,
      closedAt: null,
      closedBy: null,
      closedByName: null,
      closeNotes: null,
      countedCashPaisa: null,
      closingSnapshot: null,
      sheetsSync: null,
      createdAt: already?.createdAt || now,
      updatedAt: now,
    }

    const saved = await businessDayRepository.save(record)
    await EventPublisher.publish(EventTypes.DAY_OPENED, saved, storeId)
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
    const refundByMethod = new Map<string, { count: number; totalPaisa: number }>()
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
    const stockExceptions = stockTakes
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
        status: s.status,
        expectedCashPaisa: b.expectedCashPaisa,
        actualCashPaisa: b.actualCashPaisa,
        variancePaisa: b.variancePaisa,
      }
    })
    const openShiftsCount = cashierVariance.filter((r) => r.status === "OPEN")
      .length

    const banking = BankingService.getSnapshot()
    const warnings: string[] = []
    if (openShiftsCount > 0) {
      warnings.push(
        `${openShiftsCount} cashier shift(s) still open — close tills before day close when possible.`
      )
    }
    const openDay = this.getOpen(storeId)
    if (day === "today" && !openDay) {
      warnings.push("Business day is not open. Open Day to start the operational boundary.")
    }
    if (day === "today" && openDay && openDay.dayKey !== dayKey) {
      warnings.push(
        `Open day is ${openDay.date}, not today — close the prior day first.`
      )
    }

    return {
      dayKey,
      date: isoDate(start),
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
        byMethod: [...expenseByMethod.entries()].map(([method, totalPaisa]) => ({
          method,
          totalPaisa,
        })),
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
    // If open day is older than yesterday, still preview with calendar filter via dayKey range
    const preview = await this.getClosingPreview(
      open.dayKey === todayKey ? "today" : "yesterday",
      storeId
    )

    if (preview.openShiftsCount > 0 && !input.allowOpenShifts) {
      throw new DayOpsError(
        "CONFLICT",
        `${preview.openShiftsCount} cashier shift(s) still open. Close them or confirm allowOpenShifts.`
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
      const result = await EndOfDayService.run(dayRef, storeId)
      sheetsSync = {
        ran: true,
        ranAt: result.ranAt,
        errors: result.errors,
      }
    } else if (input.syncSheets && !EndOfDayService.isSheetsConfigured()) {
      sheetsSync = {
        ran: false,
        ranAt: null,
        errors: ["Google Sheets is not configured — close completed without sync."],
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
  static syncSheetsOnly(
    day: DayOpsDayRef = "today",
    storeId: string | null = null
  ) {
    return EndOfDayService.run(day, storeId)
  }
}
