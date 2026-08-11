import { beforeEach, describe, expect, it, vi } from "vitest"

import { FinancialYearService } from "@/modules/financialYear/FinancialYearService"

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

describe("FinancialYearService", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("creates default Indian FY and marks active", async () => {
    const { FinancialYearService: FY } = await import(
      "@/modules/financialYear/FinancialYearService"
    )
    const active = FY.getActive()
    expect(active.status).toBe("active")
    expect(active.startDate.endsWith("-04-01")).toBe(true)
    expect(active.endDate.endsWith("-03-31")).toBe(true)
  })

  it("rejects overlapping financial years", async () => {
    const { FinancialYearService: FY } = await import(
      "@/modules/financialYear/FinancialYearService"
    )
    FY.ensureDefault()
    const active = FY.getActive()
    expect(() =>
      FY.create({
        label: "Overlap",
        startDate: active.startDate,
        endDate: active.endDate,
      })
    ).toThrow(/Overlap/i)
  })

  it("validates dates inside active FY", async () => {
    const { FinancialYearService: FY } = await import(
      "@/modules/financialYear/FinancialYearService"
    )
    const active = FY.getActive()
    expect(FY.validateDateInFinancialYear(active.startDate)).toBe(true)
    expect(FY.validateDateInFinancialYear("1999-01-01")).toBe(false)
  })
})

describe("chart of accounts", () => {
  it("exposes cash and sales accounts", async () => {
    const { ACCOUNT_CODES, getAccount } = await import(
      "@/modules/accounting/chartOfAccounts"
    )
    expect(getAccount(ACCOUNT_CODES.CASH)?.type).toBe("asset")
    expect(getAccount(ACCOUNT_CODES.SALES)?.normalBalance).toBe("credit")
  })
})

// silence unused import when only dynamic imports used
void FinancialYearService
