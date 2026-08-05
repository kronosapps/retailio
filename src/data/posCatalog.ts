/**
 * Builds the POS touch-menu from the product catalog (local / Firestore).
 * Groups SKU rows by productId into multi-weight MenuItems.
 */

import { getProductDisplay } from "@/data/productDisplay"
import type { ProductRecord } from "@/data/products"
import type { MenuCategory, MenuData, MenuItem, MenuWeight } from "@/data/menu"

/** Preferred category order on the POS strip; unknown categories append A–Z. */
const CATEGORY_ORDER = [
  "Madugula Halwa",
  "Halwa Rolls",
  "Hot",
  "Laddu",
  "Sweet",
  "Honey",
  "Combos",
] as const

export function formatPackLabel(unitSize: number): string {
  if (!Number.isFinite(unitSize) || unitSize <= 0) return "1 pcs"
  if (unitSize >= 1000 && unitSize % 1000 === 0) {
    const kg = unitSize / 1000
    return kg === 1 ? "1 kg" : `${kg} kg`
  }
  if (unitSize >= 50) return `${unitSize} gm`
  return unitSize === 1 ? "1 pcs" : `${unitSize} pcs`
}

function sortCategories(categories: string[]): string[] {
  const rank = new Map<string, number>(
    CATEGORY_ORDER.map((name, index) => [name, index])
  )
  return [...categories].sort((a, b) => {
    const ra = rank.get(a) ?? 1000
    const rb = rank.get(b) ?? 1000
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, undefined, { sensitivity: "base" })
  })
}

/**
 * Convert active catalog products into the POS MenuData shape.
 */
export function buildPosCatalog(products: ProductRecord[]): MenuData {
  const active = products.filter((p) => p.active !== false)
  const byProductId = new Map<string, ProductRecord[]>()

  for (const product of active) {
    const list = byProductId.get(product.productId) ?? []
    list.push(product)
    byProductId.set(product.productId, list)
  }

  const items: MenuItem[] = []
  const categorySet = new Set<string>()

  for (const [productId, variants] of byProductId) {
    variants.sort((a, b) => a.unitSize - b.unitSize)
    const head = variants[0]
    if (!head) continue

    categorySet.add(head.category)
    const display = getProductDisplay(productId, head.category)

    const weights: MenuWeight[] = variants.map((variant) => {
      const packColor =
        display.packColors?.[variant.unitSize] || display.color
      const weight: MenuWeight = {
        weight: formatPackLabel(variant.unitSize),
        price: variant.sellingPricePaisa,
        color: packColor,
        sku: variant.sku,
        barcode: variant.barcode,
      }
      if (display.image) weight.image = display.image
      return weight
    })

    const item: MenuItem = {
      id: productId,
      name: head.name,
      category: head.category,
      color: display.color,
      weights,
    }
    if (display.image) item.image = display.image
    items.push(item)
  }

  items.sort((a, b) => {
    const byCat = a.category.localeCompare(b.category, undefined, {
      sensitivity: "base",
    })
    if (byCat !== 0) return byCat
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })

  return {
    categories: sortCategories([...categorySet]),
    items,
  }
}

export function getPosCategories(catalog: MenuData): MenuCategory[] {
  return ["All", ...catalog.categories]
}

export function getPosItemsByCategory(
  catalog: MenuData,
  category: MenuCategory
): MenuItem[] {
  if (category === "All") return catalog.items
  return catalog.items.filter((item) => item.category === category)
}

export const EMPTY_POS_CATALOG: MenuData = { categories: [], items: [] }
