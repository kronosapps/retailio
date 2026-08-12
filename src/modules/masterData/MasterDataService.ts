import { listLocalCustomers } from "@/data/customers"
import {
  ensureDefaultPaymentMethods,
  listLocalPaymentMethods,
  upsertLocalPaymentMethod,
} from "@/data/paymentMethods"
import { listLocalProducts } from "@/data/products"
import { listLocalSuppliers } from "@/data/suppliers"
import {
  ensureDefaultTaxRates,
  findLocalTaxRateByPercent,
  listLocalTaxRates,
  upsertLocalTaxRate,
} from "@/data/taxRates"
import { CHART_OF_ACCOUNTS } from "@/modules/accounting"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"
import type {
  BrandRecord,
  CreateBrandInput,
  CreateTaxRateInput,
  CreateUnitInput,
  MasterHubLink,
  PaymentMethodRecord,
  TaxRateRecord,
  UnitRecord,
} from "@/modules/masterData/types"
import type { CategoryRecord } from "@/modules/inventory/types"
import { brandRepository } from "@/repositories/BrandRepository"
import { categoryRepository } from "@/repositories/CategoryRepository"
import { unitRepository } from "@/repositories/UnitRepository"
import { createId } from "@/utils/id"

/**
 * Central facade for business master data.
 * Domain modules keep their own CRUD; this layer owns shared uniqueness
 * helpers, new masters (brands/units/tax/payment methods), and the hub map.
 */
export class MasterDataService {
  static normalizeNameKey = normalizeNameKey

  // —— Hub ——

  static getHubLinks(storeId?: string | null): MasterHubLink[] {
    const products = listLocalProducts().filter((p) =>
      storeId ? p.storeId === storeId || !p.storeId : true
    )
    const categories = categoryRepository.list()
    const brands = brandRepository.list()
    const units = unitRepository.list()
    const suppliers = listLocalSuppliers()
    const customers = listLocalCustomers()
    const taxRates = listLocalTaxRates()
    const paymentMethods = listLocalPaymentMethods()

    return [
      {
        kind: "products",
        title: "Products",
        description: "Sellable SKUs (inventory items)",
        path: "/inventory/items",
        count: products.length,
      },
      {
        kind: "categories",
        title: "Categories",
        description: "Canonical product categories (case-insensitive unique)",
        path: "/inventory/categories",
        count: categories.length,
      },
      {
        kind: "brands",
        title: "Brands",
        description: "Brand master — no Chocolate / chocolate splits",
        path: "/utilities/master-data/brands",
        count: brands.length,
      },
      {
        kind: "units",
        title: "Units",
        description: "Units of measure (g, kg, pcs, …)",
        path: "/utilities/master-data/units",
        count: units.length,
      },
      {
        kind: "suppliers",
        title: "Suppliers",
        description: "Vendor master for purchasing",
        path: "/purchasing/suppliers",
        count: suppliers.length,
      },
      {
        kind: "customers",
        title: "Customers",
        description: "CRM customer directory",
        path: "/customers",
        count: customers.length,
      },
      {
        kind: "taxRates",
        title: "Tax Rates",
        description: "GST slabs for catalog & POS",
        path: "/utilities/master-data/tax-rates",
        count: taxRates.length,
      },
      {
        kind: "paymentMethods",
        title: "Payment Methods",
        description: "Enabled tenders (Cash, UPI, On account)",
        path: "/utilities/master-data/payment-methods",
        count: paymentMethods.length,
      },
      {
        kind: "accounts",
        title: "Accounts",
        description: "Chart of accounts (fixed posting codes)",
        path: "/utilities/chart-of-accounts",
        count: CHART_OF_ACCOUNTS.length,
      },
      {
        kind: "storeSettings",
        title: "Store Settings",
        description: "Legal name, GSTIN, address",
        path: "/utilities/business-setup",
      },
    ]
  }

  // —— Categories (delegate + ensure) ——

  static listCategories(): CategoryRecord[] {
    return categoryRepository.list()
  }

  static async ensureCategory(
    name: string,
    storeId: string | null = null,
    actorId: string | null = null
  ): Promise<CategoryRecord> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error("Category name is required.")
    const existing = categoryRepository.findByName(trimmed)
    if (existing) {
      if (!existing.active) {
        return (await categoryRepository.setActive(
          existing.id,
          true,
          actorId
        ))!
      }
      return existing
    }
    return categoryRepository.create({
      name: trimmed,
      storeId,
      createdBy: actorId,
    })
  }

  // —— Brands ——

  static listBrands(): BrandRecord[] {
    return brandRepository.list()
  }

  static async createBrand(input: CreateBrandInput) {
    return brandRepository.create(input)
  }

  static async updateBrand(
    id: string,
    patch: { name?: string; active?: boolean },
    actorId: string | null = null
  ) {
    const existing = brandRepository.getById(id)
    if (!existing) throw new Error("Brand not found.")
    return brandRepository.save({
      ...existing,
      name: patch.name?.trim() || existing.name,
      active: patch.active ?? existing.active,
      updatedBy: actorId,
    })
  }

  static async setBrandActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ) {
    return brandRepository.setActive(id, active, actorId)
  }

  static async ensureBrand(
    name: string,
    storeId: string | null = null,
    actorId: string | null = null
  ) {
    return brandRepository.ensure(name, storeId, actorId)
  }

  // —— Units ——

  static listUnits(): UnitRecord[] {
    return unitRepository.list()
  }

  static async createUnit(input: CreateUnitInput) {
    return unitRepository.create(input)
  }

  static async updateUnit(
    id: string,
    patch: { code?: string; name?: string; active?: boolean },
    actorId: string | null = null
  ) {
    const existing = unitRepository.getById(id)
    if (!existing) throw new Error("Unit not found.")
    return unitRepository.save({
      ...existing,
      code: patch.code?.trim() || existing.code,
      name: patch.name?.trim() || existing.name,
      active: patch.active ?? existing.active,
      updatedBy: actorId,
    })
  }

  static async setUnitActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ) {
    return unitRepository.setActive(id, active, actorId)
  }

  static async ensureUnit(
    code: string,
    storeId: string | null = null,
    actorId: string | null = null
  ) {
    return unitRepository.ensure(code, storeId, actorId)
  }

  // —— Tax rates ——

  static listTaxRates(): TaxRateRecord[] {
    return listLocalTaxRates()
  }

  static async createTaxRate(input: CreateTaxRateInput): Promise<TaxRateRecord> {
    const rate = Number(input.ratePercent)
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error("Tax rate must be a non-negative number.")
    }
    if (findLocalTaxRateByPercent(rate)) {
      throw new Error("A tax rate with that percent already exists.")
    }
    const now = new Date().toISOString()
    return upsertLocalTaxRate({
      id: createId("tax"),
      ratePercent: rate,
      label: (input.label || (rate === 0 ? "Nil (0%)" : `GST ${rate}%`)).trim(),
      nameKey: normalizeNameKey(String(rate)),
      active: true,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    })
  }

  static async setTaxRateActive(id: string, active: boolean) {
    const existing = listLocalTaxRates().find((r) => r.id === id)
    if (!existing) throw new Error("Tax rate not found.")
    return upsertLocalTaxRate({
      ...existing,
      active,
      updatedAt: new Date().toISOString(),
    })
  }

  static activeGstPercents(): number[] {
    return listLocalTaxRates()
      .filter((r) => r.active)
      .map((r) => r.ratePercent)
  }

  // —— Payment methods ——

  static listPaymentMethods(): PaymentMethodRecord[] {
    return listLocalPaymentMethods()
  }

  static enabledPaymentMethodCodes(): string[] {
    return listLocalPaymentMethods()
      .filter((m) => m.enabled)
      .map((m) => m.code)
  }

  static setPaymentMethodEnabled(id: string, enabled: boolean) {
    const existing = listLocalPaymentMethods().find((m) => m.id === id)
    if (!existing) throw new Error("Payment method not found.")
    return upsertLocalPaymentMethod({ ...existing, enabled })
  }

  static setPaymentMethodLabel(id: string, label: string) {
    const existing = listLocalPaymentMethods().find((m) => m.id === id)
    if (!existing) throw new Error("Payment method not found.")
    const trimmed = label.trim()
    if (!trimmed) throw new Error("Label is required.")
    return upsertLocalPaymentMethod({ ...existing, label: trimmed })
  }

  /**
   * Seed categories / brands / units / tax / payment masters from the
   * product catalog and defaults (idempotent).
   */
  static async bootstrapFromCatalog(
    storeId: string | null,
    actorId: string | null
  ) {
    ensureDefaultTaxRates(storeId)
    ensureDefaultPaymentMethods(storeId)
    unitRepository.list()

    const products = listLocalProducts()
    const categoryNames = new Set<string>()
    const brandNames = new Set<string>()
    const unitCodes = new Set<string>()

    for (const p of products) {
      if (p.category?.trim()) categoryNames.add(p.category.trim())
      if (p.brand?.trim()) brandNames.add(p.brand.trim())
      if (p.unit?.trim() && Number.isNaN(Number(p.unit))) {
        unitCodes.add(p.unit.trim())
      }
    }

    for (const name of categoryNames) {
      await this.ensureCategory(name, storeId, actorId)
    }
    for (const name of brandNames) {
      await this.ensureBrand(name, storeId, actorId)
    }
    for (const code of unitCodes) {
      await this.ensureUnit(code, storeId, actorId)
    }

    return {
      categories: categoryRepository.list().length,
      brands: brandRepository.list().length,
      units: unitRepository.list().length,
      taxRates: listLocalTaxRates().length,
      paymentMethods: listLocalPaymentMethods().length,
    }
  }
}
