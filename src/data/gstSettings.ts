/**
 * Runtime GST / tax billing settings (offline-first).
 * Complements tax.json defaults with place-of-supply and pricing mode.
 */

import { taxConfig } from "./tax"

const STORAGE_KEY = "retailos.gst_settings.v1"

/** India GST slab rates commonly used in retail. */
export const GST_SLAB_RATES = [0, 5, 12, 18, 28] as const

export type GstPricingMode = "INCLUSIVE" | "EXCLUSIVE"
export type GstSupplyType = "INTRA" | "INTER"
export type GstPartyType = "B2B" | "B2C"

export type GstSettings = {
  version: 1
  /** Catalog / POS prices include tax (retail default) or exclude. */
  pricingMode: GstPricingMode
  /** Fallback rate when product.gstRate is missing. */
  defaultGstRate: number
  /**
   * Store state code (first 2 digits of GSTIN), e.g. "36" Telangana.
   * Used with customer state to decide CGST+SGST vs IGST.
   */
  storeStateCode: string
  storeGstin: string
  storeLegalName: string
  /** Default place of supply when customer state unknown (= store). */
  defaultPlaceOfSupply: string
  /** Emit bill of supply when rate is 0 / composition (scaffold). */
  compositionDealer: boolean
}

function defaults(): GstSettings {
  const gstin = ""
  return {
    version: 1,
    pricingMode: taxConfig.gst.inclusive ? "INCLUSIVE" : "EXCLUSIVE",
    defaultGstRate: taxConfig.gst.percent || 5,
    storeStateCode: "",
    storeGstin: gstin,
    storeLegalName: "",
    defaultPlaceOfSupply: "",
    compositionDealer: false,
  }
}

function read(): GstSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<GstSettings>
    const base = defaults()
    return {
      ...base,
      ...parsed,
      version: 1,
      pricingMode:
        parsed.pricingMode === "EXCLUSIVE" ? "EXCLUSIVE" : "INCLUSIVE",
      defaultGstRate: Number.isFinite(parsed.defaultGstRate)
        ? Math.max(0, Number(parsed.defaultGstRate))
        : base.defaultGstRate,
      storeStateCode: String(parsed.storeStateCode || "")
        .trim()
        .slice(0, 2),
      storeGstin: String(parsed.storeGstin || "")
        .trim()
        .toUpperCase(),
      storeLegalName: String(parsed.storeLegalName || "").trim(),
      defaultPlaceOfSupply: String(parsed.defaultPlaceOfSupply || "")
        .trim()
        .slice(0, 2),
      compositionDealer: Boolean(parsed.compositionDealer),
    }
  } catch {
    return defaults()
  }
}

function write(settings: GstSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getGstSettings(): GstSettings {
  return read()
}

export function saveGstSettings(patch: Partial<GstSettings>): GstSettings {
  const cur = read()
  const next: GstSettings = {
    ...cur,
    ...patch,
    version: 1,
    pricingMode:
      patch.pricingMode === "EXCLUSIVE"
        ? "EXCLUSIVE"
        : patch.pricingMode === "INCLUSIVE"
          ? "INCLUSIVE"
          : cur.pricingMode,
    defaultGstRate:
      patch.defaultGstRate != null
        ? Math.max(0, Number(patch.defaultGstRate))
        : cur.defaultGstRate,
    storeStateCode: (patch.storeStateCode ?? cur.storeStateCode)
      .trim()
      .slice(0, 2),
    storeGstin: (patch.storeGstin ?? cur.storeGstin).trim().toUpperCase(),
    storeLegalName: (patch.storeLegalName ?? cur.storeLegalName).trim(),
    defaultPlaceOfSupply: (
      patch.defaultPlaceOfSupply ?? cur.defaultPlaceOfSupply
    )
      .trim()
      .slice(0, 2),
  }
  if (!next.defaultPlaceOfSupply && next.storeStateCode) {
    next.defaultPlaceOfSupply = next.storeStateCode
  }
  write(next)
  return next
}

/** First two chars of GSTIN are state code. */
export function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null
  const g = gstin.trim().toUpperCase()
  if (g.length < 2) return null
  return g.slice(0, 2)
}

export function isValidGstinFormat(value?: string | null): boolean {
  if (!value) return false
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(
    value.trim()
  )
}

export const GST_SETTINGS_STORAGE_KEY = STORAGE_KEY
