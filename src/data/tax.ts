import { type Paisa, roundPaisa } from "@/lib/money"

import taxData from "./tax.json"

export type GstConfig = {
  percent: number
  label: string
  inclusive: boolean
  note?: string
}

export type TaxConfig = {
  gst: GstConfig
}

export const taxConfig = taxData as TaxConfig

/**
 * Split an inclusive paisa total into taxable value + GST.
 * GST is rounded to the nearest paisa; taxable + gst === total.
 */
export function splitInclusiveGst(
  inclusiveTotalPaisa: Paisa,
  percent = taxConfig.gst.percent
) {
  const total = Math.max(0, roundPaisa(inclusiveTotalPaisa))
  const rate = Math.max(0, percent)

  if (total <= 0 || rate <= 0) {
    return {
      taxableAmount: total,
      gstAmount: 0 as Paisa,
      gstPercent: rate,
      total,
    }
  }

  const gstAmount = roundPaisa((total * rate) / (100 + rate))
  const taxableAmount = total - gstAmount

  return {
    taxableAmount,
    gstAmount,
    gstPercent: rate,
    total,
  }
}
