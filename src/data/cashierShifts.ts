/**
 * Cashier shifts / till — local offline-first store.
 * Separate from Banking (store cashbook): this is cashier accountability.
 */

export type ShiftStatus = "OPEN" | "CLOSED"

export type TillMovementType =
  | "OPENING_FLOAT"
  | "CASH_SALE"
  | "CASH_REFUND"
  | "CASH_EXPENSE"
  | "CASH_IN"
  | "CASH_OUT"
  | "CASH_DROP"
  | "SUPPLIER_CASH"

export type TillMovement = {
  id: string
  type: TillMovementType
  /** Always positive; direction encodes sign. */
  amountPaisa: number
  direction: "in" | "out"
  referenceId: string | null
  note: string | null
  createdAt: string
  createdBy: string | null
}

export type CashierShiftRecord = {
  id: string
  shiftNumber: string
  status: ShiftStatus
  cashierId: string
  cashierName: string | null
  storeId: string | null
  openedAt: string
  closedAt: string | null
  openingFloatPaisa: number
  cashSalesPaisa: number
  cashRefundsPaisa: number
  cashExpensesPaisa: number
  cashInPaisa: number
  cashOutPaisa: number
  cashDropsPaisa: number
  supplierCashPaisa: number
  /** Opening + sales + cashIn − refunds − expenses − cashOut − drops − supplierCash */
  expectedCashPaisa: number
  actualCashPaisa: number | null
  variancePaisa: number | null
  notes: string | null
  closeNotes: string | null
  closedBy: string | null
  movements: TillMovement[]
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = "retailos.cashier_shifts.v1"
const SHIFT_PREFIX = "SHF-"
const DAILY_PAD = 5

type ShiftStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: CashierShiftRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): ShiftStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): ShiftStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<ShiftStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeCashierShift)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: ShiftStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function computeExpectedCashPaisa(
  shift: Pick<
    CashierShiftRecord,
    | "openingFloatPaisa"
    | "cashSalesPaisa"
    | "cashRefundsPaisa"
    | "cashExpensesPaisa"
    | "cashInPaisa"
    | "cashOutPaisa"
    | "cashDropsPaisa"
    | "supplierCashPaisa"
  >
): number {
  return (
    Math.max(0, shift.openingFloatPaisa) +
    Math.max(0, shift.cashSalesPaisa) +
    Math.max(0, shift.cashInPaisa) -
    Math.max(0, shift.cashRefundsPaisa) -
    Math.max(0, shift.cashExpensesPaisa) -
    Math.max(0, shift.cashOutPaisa) -
    Math.max(0, shift.cashDropsPaisa) -
    Math.max(0, shift.supplierCashPaisa)
  )
}

export function normalizeCashierShift(
  raw: CashierShiftRecord | (Partial<CashierShiftRecord> & { id: string })
): CashierShiftRecord {
  const now = new Date().toISOString()
  const base = {
    openingFloatPaisa: Math.max(0, Math.round(Number(raw.openingFloatPaisa) || 0)),
    cashSalesPaisa: Math.max(0, Math.round(Number(raw.cashSalesPaisa) || 0)),
    cashRefundsPaisa: Math.max(0, Math.round(Number(raw.cashRefundsPaisa) || 0)),
    cashExpensesPaisa: Math.max(0, Math.round(Number(raw.cashExpensesPaisa) || 0)),
    cashInPaisa: Math.max(0, Math.round(Number(raw.cashInPaisa) || 0)),
    cashOutPaisa: Math.max(0, Math.round(Number(raw.cashOutPaisa) || 0)),
    cashDropsPaisa: Math.max(0, Math.round(Number(raw.cashDropsPaisa) || 0)),
    supplierCashPaisa: Math.max(0, Math.round(Number(raw.supplierCashPaisa) || 0)),
  }
  const expected =
    typeof raw.expectedCashPaisa === "number" && Number.isFinite(raw.expectedCashPaisa)
      ? Math.round(raw.expectedCashPaisa)
      : computeExpectedCashPaisa(base)
  const actual =
    raw.actualCashPaisa == null
      ? null
      : Math.max(0, Math.round(Number(raw.actualCashPaisa) || 0))
  const variance =
    actual == null
      ? null
      : actual - expected

  return {
    id: raw.id,
    shiftNumber: raw.shiftNumber || raw.id,
    status: raw.status === "CLOSED" ? "CLOSED" : "OPEN",
    cashierId: (raw.cashierId || "").trim(),
    cashierName: raw.cashierName?.trim() || null,
    storeId: raw.storeId ?? null,
    openedAt: raw.openedAt || now,
    closedAt: raw.closedAt ?? null,
    ...base,
    expectedCashPaisa: expected,
    actualCashPaisa: actual,
    variancePaisa: variance,
    notes: raw.notes?.trim() || null,
    closeNotes: raw.closeNotes?.trim() || null,
    closedBy: raw.closedBy ?? null,
    movements: Array.isArray(raw.movements)
      ? raw.movements.map(normalizeTillMovement)
      : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
  }
}

function normalizeTillMovement(
  raw: TillMovement | (Partial<TillMovement> & { id: string })
): TillMovement {
  return {
    id: raw.id,
    type: raw.type || "CASH_IN",
    amountPaisa: Math.max(0, Math.round(Number(raw.amountPaisa) || 0)),
    direction: raw.direction === "out" ? "out" : "in",
    referenceId: raw.referenceId ?? null,
    note: raw.note?.trim() || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: raw.createdBy ?? null,
  }
}

export function listLocalCashierShifts(): CashierShiftRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.openedAt.localeCompare(a.openedAt)
  )
}

export function getLocalCashierShift(id: string): CashierShiftRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function getOpenShiftForCashier(
  cashierId: string
): CashierShiftRecord | null {
  const key = cashierId.trim()
  if (!key) return null
  return (
    listLocalCashierShifts().find(
      (s) => s.status === "OPEN" && s.cashierId === key
    ) ?? null
  )
}

export function upsertLocalCashierShift(
  record: CashierShiftRecord
): CashierShiftRecord {
  const store = readStore()
  const next = normalizeCashierShift(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextShiftNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${SHIFT_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

export const CASHIER_SHIFTS_STORAGE_KEY = STORAGE_KEY
