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

function roundMoney(amount: number) {
  return Math.round(amount)
}

/** Split an inclusive total into taxable value + GST (sums exactly to total). */
export function splitInclusiveGst(inclusiveTotal: number, percent = taxConfig.gst.percent) {
  const total = Math.max(0, inclusiveTotal)
  const rate = Math.max(0, percent)

  if (total <= 0 || rate <= 0) {
    return {
      taxableAmount: total,
      gstAmount: 0,
      gstPercent: rate,
      total,
    }
  }

  const gstAmount = roundMoney((total * rate) / (100 + rate))
  const taxableAmount = total - gstAmount

  return {
    taxableAmount,
    gstAmount,
    gstPercent: rate,
    total,
  }
}
