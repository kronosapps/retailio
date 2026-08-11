import { createId } from "@/utils/id"

import {
  getActiveFinancialYearId,
  listFinancialYears,
  setActiveFinancialYearId,
  upsertFinancialYear,
} from "./financialYearStore"
import type { CreateFinancialYearInput, FinancialYear } from "./types"

function indiaFyForDate(date = new Date()): {
  label: string
  startDate: string
  endDate: string
} {
  const y = date.getFullYear()
  const m = date.getMonth() // 0-based
  // Indian FY: Apr 1 – Mar 31
  const startYear = m >= 3 ? y : y - 1
  const endYear = startYear + 1
  return {
    label: `FY ${startYear}–${String(endYear).slice(2)}`,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
  }
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * Financial year management for Utilities / accounting reports.
 */
export class FinancialYearService {
  static list(): FinancialYear[] {
    this.ensureDefault()
    return listFinancialYears()
  }

  static getActive(): FinancialYear {
    this.ensureDefault()
    const id = getActiveFinancialYearId()
    const found = listFinancialYears().find((f) => f.id === id)
    if (found) return found
    return listFinancialYears()[0]
  }

  static getById(id: string): FinancialYear | null {
    return listFinancialYears().find((f) => f.id === id) ?? null
  }

  static getForDate(date: Date | string): FinancialYear | null {
    const iso =
      typeof date === "string"
        ? date.slice(0, 10)
        : date.toISOString().slice(0, 10)
    return (
      listFinancialYears().find(
        (f) => f.startDate <= iso && iso <= f.endDate
      ) ?? null
    )
  }

  static getRange(fy?: FinancialYear | null): { start: Date; end: Date } {
    const year = fy || this.getActive()
    const start = new Date(`${year.startDate}T00:00:00`)
    const end = new Date(`${year.endDate}T23:59:59.999`)
    return { start, end }
  }

  static validateDateInFinancialYear(
    date: Date | string,
    fy?: FinancialYear | null
  ): boolean {
    const year = fy || this.getActive()
    const iso =
      typeof date === "string"
        ? date.slice(0, 10)
        : date.toISOString().slice(0, 10)
    return year.startDate <= iso && iso <= year.endDate
  }

  static create(input: CreateFinancialYearInput): FinancialYear {
    const startDate = input.startDate.slice(0, 10)
    const endDate = input.endDate.slice(0, 10)
    if (startDate >= endDate) {
      throw new Error("End date must be after start date.")
    }
    for (const existing of listFinancialYears()) {
      if (overlaps(startDate, endDate, existing.startDate, existing.endDate)) {
        throw new Error(
          `Overlaps existing financial year ${existing.label}.`
        )
      }
    }
    const now = new Date().toISOString()
    const fy: FinancialYear = {
      id: createId("fy"),
      label: input.label.trim() || `FY ${startDate}–${endDate}`,
      startDate,
      endDate,
      status: input.makeActive === false ? "draft" : "active",
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    return upsertFinancialYear(fy, input.makeActive !== false)
  }

  static setActive(id: string) {
    setActiveFinancialYearId(id)
    return this.getActive()
  }

  static ensureDefault(storeId: string | null = null) {
    if (listFinancialYears().length > 0) return
    const def = indiaFyForDate()
    const now = new Date().toISOString()
    upsertFinancialYear(
      {
        id: createId("fy"),
        label: def.label,
        startDate: def.startDate,
        endDate: def.endDate,
        status: "active",
        storeId,
        createdAt: now,
        updatedAt: now,
      },
      true
    )
  }
}
