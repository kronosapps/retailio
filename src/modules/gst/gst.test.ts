import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
}))

vi.mock("@/events/EventPublisher", () => ({
  EventPublisher: {
    publish: vi.fn(async () => undefined),
  },
}))

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

describe("GST tax engine", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("splits inclusive line into taxable + CGST/SGST", async () => {
    const { computeLineTax } = await import("@/modules/gst/taxEngine")
    const { saveGstSettings } = await import("@/data/gstSettings")
    saveGstSettings({
      pricingMode: "INCLUSIVE",
      storeStateCode: "36",
      defaultGstRate: 5,
    })

    const line = computeLineTax(
      { netLinePaisa: 10500, gstRate: 5 },
      { pricingMode: "INCLUSIVE", supplyType: "INTRA" }
    )
    expect(line.lineTotalPaisa).toBe(10500)
    expect(line.taxablePaisa + line.gstPaisa).toBe(10500)
    expect(line.cgstPaisa + line.sgstPaisa).toBe(line.gstPaisa)
    expect(line.igstPaisa).toBe(0)
  })

  it("uses IGST for interstate supply", async () => {
    const { computeLineTax } = await import("@/modules/gst/taxEngine")
    const line = computeLineTax(
      { netLinePaisa: 11800, gstRate: 18 },
      { pricingMode: "INCLUSIVE", supplyType: "INTER" }
    )
    expect(line.igstPaisa).toBe(line.gstPaisa)
    expect(line.cgstPaisa).toBe(0)
    expect(line.sgstPaisa).toBe(0)
  })

  it("adds tax on exclusive pricing", async () => {
    const { computeLineTax } = await import("@/modules/gst/taxEngine")
    const line = computeLineTax(
      { netLinePaisa: 10000, gstRate: 5 },
      { pricingMode: "EXCLUSIVE", supplyType: "INTRA" }
    )
    expect(line.taxablePaisa).toBe(10000)
    expect(line.gstPaisa).toBe(500)
    expect(line.lineTotalPaisa).toBe(10500)
  })

  it("classifies B2B vs B2C from GSTIN", async () => {
    const { resolvePartyType, resolveSupplyType } = await import(
      "@/modules/gst/taxEngine"
    )
    const { saveGstSettings } = await import("@/data/gstSettings")
    saveGstSettings({ storeStateCode: "36" })

    expect(resolvePartyType(null)).toBe("B2C")
    expect(resolvePartyType("36AABCU9603R1ZM")).toBe("B2B")
    expect(resolveSupplyType("36")).toBe("INTRA")
    expect(resolveSupplyType("27")).toBe("INTER")
  })

  it("priceOrder attaches line tax snapshots", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const { saveGstSettings } = await import("@/data/gstSettings")
    saveGstSettings({
      pricingMode: "INCLUSIVE",
      storeStateCode: "36",
      defaultGstRate: 5,
    })

    const result = PricingService.priceOrder({
      lines: [
        {
          itemId: "A",
          sku: "A",
          name: "Item",
          qty: 1,
          listUnitPaisa: 10500,
          gstRate: 5,
          hsnCode: "1704",
        },
      ],
      customerGstin: null,
    })

    expect(result.tax.pricingMode).toBe("INCLUSIVE")
    expect(result.lines[0].taxSnapshot.hsnCode).toBe("1704")
    expect(result.lines[0].taxSnapshot.gstRate).toBe(5)
    expect(result.totals.taxableAmount + result.totals.gstAmount).toBe(
      result.totals.total
    )
    expect(result.tax.partyType).toBe("B2C")
  })

  it("exposes filing placeholders", async () => {
    const { GstService } = await import("@/modules/gst/GstService")
    const placeholders = GstService.filingPlaceholders()
    expect(placeholders.map((p) => p.id)).toEqual([
      "GSTR_1",
      "GSTR_3B",
      "E_INVOICE",
      "E_WAY_BILL",
    ])
  })
})
