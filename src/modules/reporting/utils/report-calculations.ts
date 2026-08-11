import type { RecordedSale } from "@/data/invoices"
import type { Paisa } from "@/lib/money"

export function saleDiscountPaisa(sale: RecordedSale): Paisa {
  const t = sale.totals
  return (
    (t.friendsFamilyDiscount || 0) +
    (t.occasionDiscount || 0) +
    (t.loyaltyDiscount || 0)
  )
}

export function saleGrossPaisa(sale: RecordedSale): Paisa {
  return sale.totals.grossSubtotal || 0
}

export function saleNetPaisa(sale: RecordedSale): Paisa {
  return sale.totals.total || 0
}

export function saleGstPaisa(sale: RecordedSale): Paisa {
  return sale.totals.gstAmount || 0
}

export function saleUnits(sale: RecordedSale): number {
  return sale.lines.reduce((sum, line) => {
    if (line.isLoyaltyReward) return sum
    return sum + Math.max(0, line.qty)
  }, 0)
}

export function averageOrderValuePaisa(
  totalPaisa: Paisa,
  invoiceCount: number
): Paisa {
  if (invoiceCount <= 0) return 0
  return Math.round(totalPaisa / invoiceCount)
}
