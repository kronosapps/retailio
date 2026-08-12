import {
  computeExpectedCashPaisa,
  getLocalCashierShift,
  getOpenShiftForCashier,
  listLocalCashierShifts,
  nextShiftNumber,
  upsertLocalCashierShift,
  type CashierShiftRecord,
  type TillMovement,
  type TillMovementType,
} from "@/data/cashierShifts"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.CASHIER_SHIFTS

export type { CashierShiftRecord, TillMovement, TillMovementType }

export type OpenShiftInput = {
  cashierId: string
  cashierName?: string | null
  openingFloatPaisa: number
  storeId?: string | null
  notes?: string | null
  actorId?: string | null
}

export type AppendTillMovementInput = {
  shiftId: string
  type: TillMovementType
  amountPaisa: number
  referenceId?: string | null
  note?: string | null
  actorId?: string | null
  /** Skip if a movement with this reference already exists (idempotent). */
  idempotentReference?: string | null
}

/**
 * Owns `cashier_shifts` (+ local fallback).
 */
export class CashierShiftRepository {
  list(): CashierShiftRecord[] {
    return listLocalCashierShifts()
  }

  getById(id: string): CashierShiftRecord | null {
    return getLocalCashierShift(id)
  }

  getOpenForCashier(cashierId: string): CashierShiftRecord | null {
    return getOpenShiftForCashier(cashierId)
  }

  async hydrate(): Promise<CashierShiftRecord[]> {
    const remote = await listDocuments<CashierShiftRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalCashierShift(row)
      }
    }
    return this.list()
  }

  async open(input: OpenShiftInput): Promise<CashierShiftRecord> {
    const existing = this.getOpenForCashier(input.cashierId)
    if (existing) {
      throw new Error("Cashier already has an open shift.")
    }
    const now = new Date().toISOString()
    const floatPaisa = Math.max(0, Math.round(input.openingFloatPaisa))
    const openingMovement: TillMovement = {
      id: createId("tmv"),
      type: "OPENING_FLOAT",
      amountPaisa: floatPaisa,
      direction: "in",
      referenceId: null,
      note: "Opening float",
      createdAt: now,
      createdBy: input.actorId ?? input.cashierId,
    }
    const record: CashierShiftRecord = {
      id: createId("shf"),
      shiftNumber: nextShiftNumber(),
      status: "OPEN",
      cashierId: input.cashierId.trim(),
      cashierName: input.cashierName?.trim() || null,
      storeId: input.storeId ?? null,
      openedAt: now,
      closedAt: null,
      openingFloatPaisa: floatPaisa,
      cashSalesPaisa: 0,
      cashRefundsPaisa: 0,
      cashExpensesPaisa: 0,
      cashInPaisa: 0,
      cashOutPaisa: 0,
      cashDropsPaisa: 0,
      supplierCashPaisa: 0,
      expectedCashPaisa: floatPaisa,
      actualCashPaisa: null,
      variancePaisa: null,
      notes: input.notes?.trim() || null,
      closeNotes: null,
      closedBy: null,
      movements: floatPaisa > 0 ? [openingMovement] : [],
      createdAt: now,
      updatedAt: now,
    }
    const saved = await this.persist(record)
    await EventPublisher.publish(
      EventTypes.SHIFT_OPENED,
      {
        id: saved.id,
        shiftNumber: saved.shiftNumber,
        cashierId: saved.cashierId,
        cashierName: saved.cashierName,
        openingFloatPaisa: saved.openingFloatPaisa,
        storeId: saved.storeId,
        openedAt: saved.openedAt,
      },
      saved.storeId
    )
    return saved
  }

  async appendMovement(
    input: AppendTillMovementInput
  ): Promise<CashierShiftRecord> {
    const shift = this.getById(input.shiftId)
    if (!shift) throw new Error("Shift not found.")
    if (shift.status !== "OPEN") throw new Error("Shift is closed.")

    const amount = Math.max(0, Math.round(input.amountPaisa))
    if (amount <= 0) throw new Error("Amount must be positive.")

    const idempotentKey =
      input.idempotentReference?.trim() || input.referenceId?.trim() || null
    if (idempotentKey) {
      const dup = shift.movements.find(
        (m) =>
          m.referenceId === idempotentKey ||
          m.referenceId === input.referenceId
      )
      if (dup) return shift
    }

    const direction = movementDirection(input.type)
    const movement: TillMovement = {
      id: createId("tmv"),
      type: input.type,
      amountPaisa: amount,
      direction,
      referenceId: idempotentKey || input.referenceId || null,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
      createdBy: input.actorId ?? null,
    }

    const next = applyMovementTotals(shift, movement)
    const saved = await this.persist(next)
    await EventPublisher.publish(
      EventTypes.TILL_MOVEMENT,
      {
        shiftId: saved.id,
        shiftNumber: saved.shiftNumber,
        movementId: movement.id,
        type: movement.type,
        amountPaisa: movement.amountPaisa,
        direction: movement.direction,
        referenceId: movement.referenceId,
        expectedCashPaisa: saved.expectedCashPaisa,
        cashierId: saved.cashierId,
        storeId: saved.storeId,
      },
      saved.storeId
    )
    return saved
  }

  async close(input: {
    shiftId: string
    actualCashPaisa: number
    closeNotes?: string | null
    actorId?: string | null
  }): Promise<CashierShiftRecord> {
    const shift = this.getById(input.shiftId)
    if (!shift) throw new Error("Shift not found.")
    if (shift.status !== "OPEN") throw new Error("Shift is already closed.")

    const actual = Math.max(0, Math.round(input.actualCashPaisa))
    const expected = computeExpectedCashPaisa(shift)
    const now = new Date().toISOString()
    const closed: CashierShiftRecord = {
      ...shift,
      status: "CLOSED",
      closedAt: now,
      expectedCashPaisa: expected,
      actualCashPaisa: actual,
      variancePaisa: actual - expected,
      closeNotes: input.closeNotes?.trim() || null,
      closedBy: input.actorId ?? null,
      updatedAt: now,
    }
    const saved = await this.persist(closed)
    await EventPublisher.publish(
      EventTypes.SHIFT_CLOSED,
      {
        id: saved.id,
        shiftNumber: saved.shiftNumber,
        cashierId: saved.cashierId,
        cashierName: saved.cashierName,
        expectedCashPaisa: saved.expectedCashPaisa,
        actualCashPaisa: saved.actualCashPaisa,
        variancePaisa: saved.variancePaisa,
        storeId: saved.storeId,
        closedAt: saved.closedAt,
      },
      saved.storeId
    )
    return saved
  }

  private async persist(
    record: CashierShiftRecord
  ): Promise<CashierShiftRecord> {
    const next = upsertLocalCashierShift({
      ...record,
      expectedCashPaisa: computeExpectedCashPaisa(record),
      updatedAt: new Date().toISOString(),
    })
    await upsertDocument(COLLECTION, next.id, next)
    return next
  }
}

function movementDirection(type: TillMovementType): "in" | "out" {
  switch (type) {
    case "OPENING_FLOAT":
    case "CASH_SALE":
    case "CASH_IN":
      return "in"
    case "CASH_REFUND":
    case "CASH_EXPENSE":
    case "CASH_OUT":
    case "CASH_DROP":
    case "SUPPLIER_CASH":
      return "out"
  }
}

function applyMovementTotals(
  shift: CashierShiftRecord,
  movement: TillMovement
): CashierShiftRecord {
  const next = {
    ...shift,
    movements: [...shift.movements, movement],
  }
  switch (movement.type) {
    case "OPENING_FLOAT":
      next.openingFloatPaisa += movement.amountPaisa
      break
    case "CASH_SALE":
      next.cashSalesPaisa += movement.amountPaisa
      break
    case "CASH_REFUND":
      next.cashRefundsPaisa += movement.amountPaisa
      break
    case "CASH_EXPENSE":
      next.cashExpensesPaisa += movement.amountPaisa
      break
    case "CASH_IN":
      next.cashInPaisa += movement.amountPaisa
      break
    case "CASH_OUT":
      next.cashOutPaisa += movement.amountPaisa
      break
    case "CASH_DROP":
      next.cashDropsPaisa += movement.amountPaisa
      break
    case "SUPPLIER_CASH":
      next.supplierCashPaisa += movement.amountPaisa
      break
  }
  next.expectedCashPaisa = computeExpectedCashPaisa(next)
  return next
}

export const cashierShiftRepository = new CashierShiftRepository()
