import type { RecordedSale } from "@/data/invoices"
import { rupeesToPaisa } from "@/lib/money"
import { productRepository } from "@/repositories/ProductRepository"

/**
 * Unit cost (paisa) for a SKU from catalog purchase price.
 * Missing / non-finite cost → 0 (skip COGS for that line).
 */
export function unitCostPaisa(sku: string | null | undefined): number {
  if (!sku) return 0
  const product = productRepository.getById(sku.trim())
  const rupees = product?.purchasePrice
  if (rupees == null || !Number.isFinite(rupees) || rupees < 0) return 0
  return rupeesToPaisa(rupees)
}

/** COGS for a paid sale (loyalty reward lines excluded). */
export function saleCogsPaisa(sale: RecordedSale): number {
  let total = 0
  for (const line of sale.lines || []) {
    if (line.isLoyaltyReward || line.qty <= 0) continue
    const sku = (line.sku || line.itemId || "").trim()
    const unit = unitCostPaisa(sku)
    if (unit <= 0) continue
    total += Math.round(line.qty * unit)
  }
  return Math.max(0, total)
}

/** Inventory value for a movement qty at catalog cost. */
export function movementCostPaisa(
  sku: string,
  quantity: number
): number {
  const qty = Math.abs(Number(quantity) || 0)
  if (qty <= 0) return 0
  const unit = unitCostPaisa(sku)
  if (unit <= 0) return 0
  return Math.round(qty * unit)
}
