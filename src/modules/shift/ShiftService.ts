import { rupeesToPaisa } from "@/lib/money"
import {
  computeExpectedCashPaisa,
  type CashierShiftRecord,
  type TillMovementType,
} from "@/data/cashierShifts"
import {
  cashierShiftRepository,
  type AppendTillMovementInput,
} from "@/repositories/CashierShiftRepository"

export class ShiftError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS" | "CONFLICT"

  constructor(code: ShiftError["code"], message: string) {
    super(message)
    this.name = "ShiftError"
    this.code = code
  }
}

export type OpenShiftParams = {
  cashierId: string
  cashierName?: string | null
  /** Opening float in rupees. */
  openingFloatRupees: number
  storeId?: string | null
  notes?: string | null
  actorId?: string | null
}

export type TillCashActionParams = {
  shiftId?: string
  cashierId: string
  amountRupees: number
  note?: string | null
  actorId?: string | null
}

export type CloseShiftParams = {
  shiftId?: string
  cashierId: string
  /** Counted drawer cash in rupees. */
  actualCashRupees: number
  closeNotes?: string | null
  actorId?: string | null
}

/**
 * Cashier shift / till — accountability separate from Banking cashbook.
 */
export class ShiftService {
  static list(): CashierShiftRecord[] {
    return cashierShiftRepository.list()
  }

  static getById(id: string): CashierShiftRecord | null {
    return cashierShiftRepository.getById(id)
  }

  static getOpenForCashier(cashierId: string): CashierShiftRecord | null {
    return cashierShiftRepository.getOpenForCashier(cashierId)
  }

  static hydrate() {
    return cashierShiftRepository.hydrate()
  }

  static async open(input: OpenShiftParams): Promise<CashierShiftRecord> {
    const cashierId = input.cashierId?.trim()
    if (!cashierId) {
      throw new ShiftError("VALIDATION", "Cashier is required.")
    }
    if (
      !Number.isFinite(input.openingFloatRupees) ||
      input.openingFloatRupees < 0
    ) {
      throw new ShiftError("VALIDATION", "Opening float cannot be negative.")
    }
    if (this.getOpenForCashier(cashierId)) {
      throw new ShiftError(
        "CONFLICT",
        "This cashier already has an open shift. Close it first."
      )
    }
    try {
      return await cashierShiftRepository.open({
        cashierId,
        cashierName: input.cashierName,
        openingFloatPaisa: rupeesToPaisa(input.openingFloatRupees),
        storeId: input.storeId,
        notes: input.notes,
        actorId: input.actorId ?? cashierId,
      })
    } catch (err) {
      if (err instanceof ShiftError) throw err
      throw new ShiftError(
        "CONFLICT",
        err instanceof Error ? err.message : "Could not open shift."
      )
    }
  }

  static async cashIn(input: TillCashActionParams) {
    return this.manualMovement(input, "CASH_IN")
  }

  static async cashOut(input: TillCashActionParams) {
    return this.manualMovement(input, "CASH_OUT")
  }

  static async cashDrop(input: TillCashActionParams) {
    return this.manualMovement(input, "CASH_DROP")
  }

  static async close(input: CloseShiftParams): Promise<CashierShiftRecord> {
    const shift = this.resolveOpenShift(input.shiftId, input.cashierId)
    if (
      !Number.isFinite(input.actualCashRupees) ||
      input.actualCashRupees < 0
    ) {
      throw new ShiftError("VALIDATION", "Actual cash cannot be negative.")
    }
    try {
      return await cashierShiftRepository.close({
        shiftId: shift.id,
        actualCashPaisa: rupeesToPaisa(input.actualCashRupees),
        closeNotes: input.closeNotes,
        actorId: input.actorId ?? input.cashierId,
      })
    } catch (err) {
      if (err instanceof ShiftError) throw err
      throw new ShiftError(
        "INVALID_STATUS",
        err instanceof Error ? err.message : "Could not close shift."
      )
    }
  }

  /**
   * Idempotent till posting used by TillEngine (events).
   * No-op when cashier has no open shift.
   */
  static async recordAutomatedMovement(input: {
    cashierId: string | null | undefined
    type: Extract<
      TillMovementType,
      "CASH_SALE" | "CASH_REFUND" | "CASH_EXPENSE" | "SUPPLIER_CASH"
    >
    amountPaisa: number
    referenceId: string
    note?: string | null
    actorId?: string | null
  }): Promise<CashierShiftRecord | null> {
    const cashierId = input.cashierId?.trim()
    if (!cashierId) return null
    const shift = this.getOpenForCashier(cashierId)
    if (!shift) return null
    const amount = Math.max(0, Math.round(input.amountPaisa))
    if (amount <= 0) return shift

    return cashierShiftRepository.appendMovement({
      shiftId: shift.id,
      type: input.type,
      amountPaisa: amount,
      referenceId: input.referenceId,
      idempotentReference: input.referenceId,
      note: input.note,
      actorId: input.actorId ?? cashierId,
    })
  }

  static expectedBreakdown(shift: CashierShiftRecord) {
    const expected = computeExpectedCashPaisa(shift)
    return {
      openingFloatPaisa: shift.openingFloatPaisa,
      cashSalesPaisa: shift.cashSalesPaisa,
      cashRefundsPaisa: shift.cashRefundsPaisa,
      cashExpensesPaisa: shift.cashExpensesPaisa,
      cashInPaisa: shift.cashInPaisa,
      cashOutPaisa: shift.cashOutPaisa,
      cashDropsPaisa: shift.cashDropsPaisa,
      supplierCashPaisa: shift.supplierCashPaisa,
      expectedCashPaisa: expected,
      actualCashPaisa: shift.actualCashPaisa,
      variancePaisa:
        shift.actualCashPaisa == null
          ? null
          : shift.actualCashPaisa - expected,
    }
  }

  private static async manualMovement(
    input: TillCashActionParams,
    type: "CASH_IN" | "CASH_OUT" | "CASH_DROP"
  ) {
    if (!Number.isFinite(input.amountRupees) || input.amountRupees <= 0) {
      throw new ShiftError("VALIDATION", "Enter an amount greater than zero.")
    }
    const shift = this.resolveOpenShift(input.shiftId, input.cashierId)
    const payload: AppendTillMovementInput = {
      shiftId: shift.id,
      type,
      amountPaisa: rupeesToPaisa(input.amountRupees),
      note: input.note,
      actorId: input.actorId ?? input.cashierId,
    }
    try {
      return await cashierShiftRepository.appendMovement(payload)
    } catch (err) {
      throw new ShiftError(
        "INVALID_STATUS",
        err instanceof Error ? err.message : "Could not record till movement."
      )
    }
  }

  private static resolveOpenShift(
    shiftId: string | undefined,
    cashierId: string
  ): CashierShiftRecord {
    if (shiftId) {
      const shift = this.getById(shiftId)
      if (!shift) throw new ShiftError("NOT_FOUND", "Shift not found.")
      if (shift.status !== "OPEN") {
        throw new ShiftError("INVALID_STATUS", "Shift is closed.")
      }
      return shift
    }
    const open = this.getOpenForCashier(cashierId)
    if (!open) {
      throw new ShiftError(
        "NOT_FOUND",
        "No open shift. Open the till before cash movements."
      )
    }
    return open
  }
}

export type { CashierShiftRecord }
