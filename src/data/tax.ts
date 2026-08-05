import { type Paisa, roundPaisa } from "@/lib/money"

import taxData from "./tax.json"

export type GstConfig = {
  percent: number
  label: string
  inclusive: boolean
  cgstPercent: number
  sgstPercent: number
  cgstLabel: string
  sgstLabel: string
  note?: string
}

export type TaxConfig = {
  gst: GstConfig
}

export const taxConfig = taxData as TaxConfig

export type InclusiveGstSplit = {
  taxableAmount: Paisa
  /** Total GST (CGST + SGST) */
  gstAmount: Paisa
  gstPercent: number
  cgstAmount: Paisa
  sgstAmount: Paisa
  cgstPercent: number
  sgstPercent: number
  total: Paisa
}

/**
 * Split an inclusive paisa total into taxable value + CGST + SGST.
 * Total GST is rounded to the nearest paisa; CGST gets half (rounded),
 * SGST gets the remainder so taxable + cgst + sgst === total.
 */
export function splitInclusiveGst(
  inclusiveTotalPaisa: Paisa,
  percent = taxConfig.gst.percent
): InclusiveGstSplit {
  const total = Math.max(0, roundPaisa(inclusiveTotalPaisa))
  const rate = Math.max(0, percent)
  const cgstPercent = taxConfig.gst.cgstPercent
  const sgstPercent = taxConfig.gst.sgstPercent

  if (total <= 0 || rate <= 0) {
    return {
      taxableAmount: total,
      gstAmount: 0,
      gstPercent: rate,
      cgstAmount: 0,
      sgstAmount: 0,
      cgstPercent,
      sgstPercent,
      total,
    }
  }

  const gstAmount = roundPaisa((total * rate) / (100 + rate))
  const taxableAmount = total - gstAmount
  const cgstAmount = roundPaisa(gstAmount / 2)
  const sgstAmount = gstAmount - cgstAmount

  return {
    taxableAmount,
    gstAmount,
    gstPercent: rate,
    cgstAmount,
    sgstAmount,
    cgstPercent,
    sgstPercent,
    total,
  }
}
