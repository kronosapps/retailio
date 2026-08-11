/**
 * Local product catalog (offline-first).
 * Each row is one sellable SKU. Firestore doc id = SKU.
 * Money is stored in paisa; JSON seed is authored in rupees.
 */

import { rupeesToPaisa, type Paisa } from "@/lib/money"
import { env } from "@/core/config/env"
import { DEFAULT_REORDER_LEVEL } from "@/modules/inventory/types"

import catalogSeed from "./products.json"

const STORAGE_KEY = "retailos.products.v1"

/**
 * Bump when products.json schema/content must re-upload to
 * localStorage + Firestore + Google Sheets (even if already seeded).
 */
export const PRODUCT_CATALOG_VERSION = 2

export type ProductSeedRow = {
  productId: string
  sku: string
  barcode: string | null
  name: string
  category: string
  brand: string | null
  unitSize: number
  gstRate: number
  /** CGST % (e.g. 2.5) */
  cgst?: number | null
  /** SGST % (e.g. 2.5) */
  sgst?: number | null
  hsnCode: string | null
  purchasePrice: number | null
  sellingPrice: number
  mrp: number | null
}

export type ProductRecord = {
  /** Firestore / local document id — unique SKU */
  id: string
  productId: string
  sku: string
  barcode: string | null
  name: string
  category: string
  brand: string | null
  /** Pack size from catalog Unit column (e.g. 100, 250, 500, 1000) */
  unitSize: number
  /** Display unit string (same numeric value as catalog Unit) */
  unit: string
  gstRate: number
  cgst: number
  sgst: number
  hsnCode: string | null
  purchasePricePaisa: Paisa | null
  sellingPricePaisa: Paisa
  mrpPaisa: Paisa | null
  /** Rupee mirrors for Sheets / admin readability */
  purchasePrice: number | null
  sellingPrice: number
  mrp: number | null
  /** Units at/below this qty are low stock. Defaults applied when missing (legacy). */
  reorderLevel: number
  storeId: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

type ProductStore = {
  version: 1
  /** Tracks which products.json generation was last synced */
  catalogVersion: number
  items: ProductRecord[]
  seeded: boolean
}

function emptyStore(): ProductStore {
  return { version: 1, catalogVersion: 0, items: [], seeded: false }
}

function readStore(): ProductStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<ProductStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      catalogVersion:
        typeof parsed.catalogVersion === "number" ? parsed.catalogVersion : 0,
      items: parsed.items as ProductRecord[],
      seeded: Boolean(parsed.seeded),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: ProductStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function optionalRupees(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  return value
}

export function seedRowToRecord(
  row: ProductSeedRow,
  meta: {
    storeId: string | null
    createdBy: string | null
    createdAt?: string
  }
): ProductRecord {
  const now = meta.createdAt ?? new Date().toISOString()
  const purchasePrice = optionalRupees(row.purchasePrice)
  const mrp = optionalRupees(row.mrp)
  const sellingPrice = Number.isFinite(row.sellingPrice) ? row.sellingPrice : 0
  const brand = row.brand?.trim() || null
  const hsnCode = row.hsnCode?.trim() || null
  const barcode = row.barcode?.trim() || null
  const gstRate = Number.isFinite(row.gstRate) ? row.gstRate : 0
  const cgst =
    typeof row.cgst === "number" && Number.isFinite(row.cgst)
      ? row.cgst
      : gstRate / 2
  const sgst =
    typeof row.sgst === "number" && Number.isFinite(row.sgst)
      ? row.sgst
      : gstRate / 2

  return {
    id: row.sku.trim(),
    productId: row.productId.trim(),
    sku: row.sku.trim(),
    barcode,
    name: row.name.trim(),
    category: row.category.trim(),
    brand,
    unitSize: Number.isFinite(row.unitSize) ? row.unitSize : 1,
    unit: String(row.unitSize),
    gstRate,
    cgst,
    sgst,
    hsnCode,
    purchasePricePaisa:
      purchasePrice === null ? null : rupeesToPaisa(purchasePrice),
    sellingPricePaisa: rupeesToPaisa(sellingPrice),
    mrpPaisa: mrp === null ? null : rupeesToPaisa(mrp),
    purchasePrice,
    sellingPrice,
    mrp,
    reorderLevel: DEFAULT_REORDER_LEVEL,
    storeId: meta.storeId,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: meta.createdBy,
    updatedBy: meta.createdBy,
  }
}

/** Normalize legacy local/Firestore rows that predate reorderLevel. */
export function normalizeProductRecord(
  record: ProductRecord | (Omit<ProductRecord, "reorderLevel"> & {
    reorderLevel?: number
  })
): ProductRecord {
  const reorder =
    typeof record.reorderLevel === "number" &&
    Number.isFinite(record.reorderLevel) &&
    record.reorderLevel >= 0
      ? record.reorderLevel
      : DEFAULT_REORDER_LEVEL
  return { ...record, reorderLevel: reorder }
}

export function getCatalogSeedRows(): ProductSeedRow[] {
  return catalogSeed as ProductSeedRow[]
}

export function buildCatalogRecords(
  storeId: string | null = env.storeId || null,
  createdBy: string | null = "system"
): ProductRecord[] {
  const now = new Date().toISOString()
  return getCatalogSeedRows().map((row) =>
    seedRowToRecord(row, { storeId, createdBy, createdAt: now })
  )
}

export function listLocalProducts(): ProductRecord[] {
  return [...readStore().items]
    .map(normalizeProductRecord)
    .sort((a, b) => {
      const byCategory = a.category.localeCompare(b.category, undefined, {
        sensitivity: "base",
      })
      if (byCategory !== 0) return byCategory
      const byName = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      })
      if (byName !== 0) return byName
      return a.unitSize - b.unitSize
    })
}

export function getLocalProduct(idOrSku: string): ProductRecord | null {
  const found =
    readStore().items.find(
      (item) => item.id === idOrSku || item.sku === idOrSku
    ) ?? null
  return found ? normalizeProductRecord(found) : null
}

export function isProductCatalogSeeded(): boolean {
  const store = readStore()
  return store.seeded && store.items.length > 0
}

/** True when local catalog is behind the bundled products.json generation. */
export function needsProductCatalogResync(): boolean {
  const store = readStore()
  if (!store.seeded || store.items.length === 0) return true
  return store.catalogVersion < PRODUCT_CATALOG_VERSION
}

export function markProductCatalogSeeded(
  catalogVersion: number = PRODUCT_CATALOG_VERSION
) {
  const store = readStore()
  store.seeded = true
  store.catalogVersion = catalogVersion
  writeStore(store)
}

export function upsertLocalProduct(record: ProductRecord): ProductRecord {
  const store = readStore()
  const index = store.items.findIndex((item) => item.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function replaceLocalProducts(
  items: ProductRecord[],
  catalogVersion: number = PRODUCT_CATALOG_VERSION
) {
  writeStore({
    version: 1,
    catalogVersion,
    items,
    seeded: true,
  })
}

export function deleteLocalProduct(id: string): ProductRecord | null {
  const store = readStore()
  const existing = store.items.find((item) => item.id === id) ?? null
  if (!existing) return null
  store.items = store.items.filter((item) => item.id !== id)
  writeStore(store)
  return existing
}
