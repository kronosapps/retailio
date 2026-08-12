/** Business master-data records — single-company retail. */

export type MasterEntityKind =
  | "products"
  | "categories"
  | "units"
  | "brands"
  | "suppliers"
  | "customers"
  | "taxRates"
  | "paymentMethods"
  | "accounts"
  | "storeSettings"

export type BrandRecord = {
  id: string
  name: string
  /** normalizeNameKey(name) — uniqueness key */
  nameKey: string
  active: boolean
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export type CreateBrandInput = {
  name: string
  storeId?: string | null
  createdBy?: string | null
}

export type UnitRecord = {
  id: string
  /** Short code used on products (g, kg, pcs). */
  code: string
  name: string
  nameKey: string
  active: boolean
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export type CreateUnitInput = {
  code: string
  name?: string
  storeId?: string | null
  createdBy?: string | null
}

export type TaxRateRecord = {
  id: string
  /** GST % slab (e.g. 5, 12, 18). */
  ratePercent: number
  label: string
  nameKey: string
  active: boolean
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export type CreateTaxRateInput = {
  ratePercent: number
  label?: string
  storeId?: string | null
  createdBy?: string | null
}

/** Configurable tender types (POS still validates against enabled codes). */
export type PaymentMethodRecord = {
  id: string
  code: string
  label: string
  nameKey: string
  enabled: boolean
  sortOrder: number
  storeId: string | null
  createdAt: string
  updatedAt: string
}

export type MasterHubLink = {
  kind: MasterEntityKind
  title: string
  description: string
  path: string
  count?: number
}
