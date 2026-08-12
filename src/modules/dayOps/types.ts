/** Store business day — Open Day → Operations → Close Day. */

export type BusinessDayStatus = "OPEN" | "CLOSED"

export type DayOpsDayRef = "today" | "yesterday"

export type SodChecklist = {
  bankingVerified: boolean
  floatReady: boolean
  printersOk: boolean
  upiQrOk: boolean
}

export type BusinessDayRecord = {
  id: string
  /** YYYYMMDD calendar key */
  dayKey: string
  /** ISO date YYYY-MM-DD */
  date: string
  label: string
  status: BusinessDayStatus
  storeId: string | null
  openedAt: string
  openedBy: string | null
  openedByName: string | null
  /** Snapshot at open (from banking or manager entry). */
  openingCashPaisa: number
  openingUpiPaisa: number
  openNotes: string | null
  sodChecklist: SodChecklist | null
  closedAt: string | null
  closedBy: string | null
  closedByName: string | null
  closeNotes: string | null
  /** Optional counted drawer cash at close. */
  countedCashPaisa: number | null
  /** Frozen closing preview at close time. */
  closingSnapshot: DayClosingPreview | null
  sheetsSync: {
    ran: boolean
    ranAt: string | null
    errors: string[]
  } | null
  /** Admin reopen audit. */
  reopenedAt: string | null
  reopenedBy: string | null
  reopenedByName: string | null
  reopenReason: string | null
  createdAt: string
  updatedAt: string
}

export type DaySalesSummary = {
  invoiceCount: number
  paidInvoiceCount: number
  salesTotalPaisa: number
  paidSalesPaisa: number
}

export type DayTenderSummary = {
  cashInPaisa: number
  cashOutRefundsPaisa: number
  upiInPaisa: number
  upiOutRefundsPaisa: number
  onAccountPaisa: number
  paymentCount: number
}

export type DayRefundsSummary = {
  count: number
  totalPaisa: number
  byMethod: { method: string; count: number; totalPaisa: number }[]
}

export type DayDiscountsSummary = {
  invoiceCountWithDiscount: number
  totalDiscountPaisa: number
}

export type DayExpensesSummary = {
  count: number
  totalPaisa: number
  byMethod: { method: string; totalPaisa: number }[]
}

export type DayStockException = {
  id: string
  label: string
  kind: "stock_take" | "movement" | "negative_stock" | "open_po"
  varianceLines: number
  at: string
}

export type DayCashierVarianceRow = {
  shiftId: string
  shiftNumber: string
  cashierName: string
  cashierId: string
  status: "OPEN" | "CLOSED"
  expectedCashPaisa: number
  actualCashPaisa: number | null
  variancePaisa: number | null
}

export type DayClosingPreview = {
  dayKey: string
  date: string
  label: string
  periodStart: string
  periodEnd: string
  sales: DaySalesSummary
  cash: { inPaisa: number; refundsPaisa: number; netPaisa: number }
  upi: { inPaisa: number; refundsPaisa: number; netPaisa: number }
  tenders: DayTenderSummary
  refunds: DayRefundsSummary
  discounts: DayDiscountsSummary
  expenses: DayExpensesSummary
  stockExceptions: DayStockException[]
  cashierVariance: DayCashierVarianceRow[]
  openShiftsCount: number
  bankingClosingCashPaisa: number
  bankingClosingUpiPaisa: number
  warnings: string[]
}

export type SuggestedOpenings = {
  cashPaisa: number
  upiPaisa: number
  source: "yesterday_close" | "banking"
  sourceLabel: string
}

export type OpenDayInput = {
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  openingCashPaisa?: number
  openingUpiPaisa?: number
  notes?: string | null
  checklist?: Partial<SodChecklist> | null
  /** Allow reopen if somehow needed — default false. Prefer reopenDay(). */
  force?: boolean
}

export type ReopenDayInput = {
  dayKey: string
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  reason: string
}

export type CloseDayInput = {
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  countedCashPaisa?: number | null
  notes?: string | null
  /** Run Google Sheets EndOfDayService sync (default true when configured). */
  syncSheets?: boolean
  /** Close even if open cashier shifts remain. */
  allowOpenShifts?: boolean
}
