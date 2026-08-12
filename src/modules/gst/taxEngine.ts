/**
 * GST tax engine — line and order tax for inclusive / exclusive pricing.
 * Supports CGST+SGST (intra-state) and IGST (inter-state).
 */

import {
  getGstSettings,
  isValidGstinFormat,
  stateCodeFromGstin,
  type GstPartyType,
  type GstPricingMode,
  type GstSupplyType,
} from "@/data/gstSettings"
import { taxConfig } from "@/data/tax"
import { type Paisa, percentOfPaisa, roundPaisa } from "@/lib/money"

import type { LineTaxSnapshot, OrderTaxSummary } from "./types"

export type LineTaxComputeInput = {
  /** Net line amount in paisa (after discounts). */
  netLinePaisa: Paisa
  gstRate?: number | null
  hsnCode?: string | null
  sacCode?: string | null
  isLoyaltyReward?: boolean
}

export type OrderTaxContext = {
  customerGstin?: string | null
  /** Explicit customer state code; else derived from GSTIN. */
  customerStateCode?: string | null
  pricingMode?: GstPricingMode
  at?: Date
}

function normalizeRate(rate: number | null | undefined, fallback: number) {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return fallback
  return rate
}

export function resolveSupplyType(
  customerStateCode: string | null | undefined,
  storeStateCode = getGstSettings().storeStateCode
): GstSupplyType {
  const store = (storeStateCode || "").trim()
  const cust = (customerStateCode || "").trim()
  if (store && cust && store !== cust) return "INTER"
  return "INTRA"
}

export function resolvePartyType(
  customerGstin?: string | null
): GstPartyType {
  return isValidGstinFormat(customerGstin) ? "B2B" : "B2C"
}

export function resolvePlaceOfSupply(
  customerStateCode: string | null | undefined,
  customerGstin?: string | null
): string {
  const settings = getGstSettings()
  const fromCust =
    (customerStateCode || "").trim() ||
    stateCodeFromGstin(customerGstin) ||
    ""
  return (
    fromCust ||
    settings.defaultPlaceOfSupply ||
    settings.storeStateCode ||
    ""
  )
}

/**
 * Split one line. Inclusive: tax embedded in net. Exclusive: tax added on top.
 */
export function computeLineTax(
  input: LineTaxComputeInput,
  opts: {
    pricingMode: GstPricingMode
    supplyType: GstSupplyType
    defaultRate?: number
  }
): LineTaxSnapshot {
  const settings = getGstSettings()
  const rate = normalizeRate(
    input.gstRate,
    opts.defaultRate ?? settings.defaultGstRate
  )
  const net = Math.max(0, roundPaisa(input.netLinePaisa || 0))
  const empty: LineTaxSnapshot = {
    hsnCode: input.hsnCode?.trim() || null,
    sacCode: input.sacCode?.trim() || null,
    gstRate: rate,
    pricingMode: opts.pricingMode,
    supplyType: opts.supplyType,
    taxablePaisa: 0,
    cgstPaisa: 0,
    sgstPaisa: 0,
    igstPaisa: 0,
    gstPaisa: 0,
    lineTotalPaisa: 0,
  }

  if (input.isLoyaltyReward || net <= 0) {
    return { ...empty, gstRate: rate }
  }

  let taxablePaisa = 0
  let gstPaisa = 0
  let lineTotalPaisa = net

  if (opts.pricingMode === "INCLUSIVE") {
    if (rate <= 0) {
      taxablePaisa = net
      gstPaisa = 0
      lineTotalPaisa = net
    } else {
      gstPaisa = roundPaisa((net * rate) / (100 + rate))
      taxablePaisa = net - gstPaisa
      lineTotalPaisa = net
    }
  } else {
    taxablePaisa = net
    gstPaisa = rate > 0 ? percentOfPaisa(taxablePaisa, rate) : 0
    lineTotalPaisa = taxablePaisa + gstPaisa
  }

  let cgstPaisa = 0
  let sgstPaisa = 0
  let igstPaisa = 0
  if (opts.supplyType === "INTER") {
    igstPaisa = gstPaisa
  } else {
    cgstPaisa = roundPaisa(gstPaisa / 2)
    sgstPaisa = gstPaisa - cgstPaisa
  }

  return {
    hsnCode: input.hsnCode?.trim() || null,
    sacCode: input.sacCode?.trim() || null,
    gstRate: rate,
    pricingMode: opts.pricingMode,
    supplyType: opts.supplyType,
    taxablePaisa,
    cgstPaisa,
    sgstPaisa,
    igstPaisa,
    gstPaisa,
    lineTotalPaisa,
  }
}

export function aggregateLineTaxes(
  lines: LineTaxSnapshot[],
  ctx: OrderTaxContext = {}
): OrderTaxSummary {
  const settings = getGstSettings()
  const pricingMode = ctx.pricingMode || settings.pricingMode
  const custState =
    (ctx.customerStateCode || "").trim() ||
    stateCodeFromGstin(ctx.customerGstin) ||
    null
  const supplyType = resolveSupplyType(custState, settings.storeStateCode)
  const partyType = resolvePartyType(ctx.customerGstin)
  const placeOfSupply = resolvePlaceOfSupply(custState, ctx.customerGstin)

  let taxablePaisa = 0
  let cgstPaisa = 0
  let sgstPaisa = 0
  let igstPaisa = 0
  let totalPaisa = 0
  const rates = new Set<number>()

  for (const line of lines) {
    taxablePaisa += line.taxablePaisa
    cgstPaisa += line.cgstPaisa
    sgstPaisa += line.sgstPaisa
    igstPaisa += line.igstPaisa
    totalPaisa += line.lineTotalPaisa
    if (line.gstRate > 0 || line.taxablePaisa > 0) rates.add(line.gstRate)
  }

  const gstPaisa = cgstPaisa + sgstPaisa + igstPaisa

  return {
    pricingMode,
    supplyType,
    partyType,
    placeOfSupply,
    customerGstin: ctx.customerGstin?.trim().toUpperCase() || null,
    storeGstin: settings.storeGstin || null,
    taxablePaisa: roundPaisa(taxablePaisa),
    cgstPaisa: roundPaisa(cgstPaisa),
    sgstPaisa: roundPaisa(sgstPaisa),
    igstPaisa: roundPaisa(igstPaisa),
    gstPaisa: roundPaisa(gstPaisa),
    totalPaisa: roundPaisa(totalPaisa),
    ratesUsed: [...rates].sort((a, b) => a - b),
  }
}

/**
 * Compute tax snapshots for priced cart lines and order summary.
 * Prefer product gstRate/HSN; fall back to store default.
 */
export function taxPricedLines(
  lines: {
    netLinePaisa: Paisa
    gstRate?: number | null
    hsnCode?: string | null
    sacCode?: string | null
    isLoyaltyReward?: boolean
  }[],
  ctx: OrderTaxContext = {}
): { lineTaxes: LineTaxSnapshot[]; summary: OrderTaxSummary } {
  const settings = getGstSettings()
  const pricingMode = ctx.pricingMode || settings.pricingMode
  const custState =
    (ctx.customerStateCode || "").trim() ||
    stateCodeFromGstin(ctx.customerGstin) ||
    null
  const supplyType = resolveSupplyType(custState, settings.storeStateCode)

  const lineTaxes = lines.map((line) =>
    computeLineTax(line, {
      pricingMode,
      supplyType,
      defaultRate: settings.defaultGstRate || taxConfig.gst.percent,
    })
  )

  return {
    lineTaxes,
    summary: aggregateLineTaxes(lineTaxes, {
      ...ctx,
      pricingMode,
      customerStateCode: custState,
    }),
  }
}

/** Half-rate labels for display (CGST/SGST each rate/2). */
export function halfRate(gstRate: number): number {
  return Math.round((gstRate / 2) * 1000) / 1000
}
