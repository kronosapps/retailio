# Business Master Data (single-company)

Centralized masters so RetailOS does not drift into `"Chocolate"` / `"chocolate"` / `"CHOCOLATE"` as different entities.

Status: **foundation in place**. Hub: **Utilities → Master Data**.

Day-2 hardening: [`docs/MASTER_DATA_TODO.md`](./MASTER_DATA_TODO.md).

---

## Entities

| Master | Where | Uniqueness |
|--------|--------|------------|
| Products | Inventory items | SKU (upper), barcode |
| Categories | Inventory + ensure on product save | `nameKey` |
| Brands | Master Data → Brands | `nameKey` |
| Units | Master Data → Units | code / `nameKey` |
| Suppliers | Purchasing | `nameKey` on create/update |
| Customers | `/customers` | phone helpers (create hardening parked) |
| Tax Rates | Master Data → Tax Rates | rate % |
| Payment Methods | Master Data → Payment Methods | fixed codes; enable/label |
| Accounts | Accounting CoA | fixed codes (not editable) |
| Store Settings | Business Setup | one doc / store |

Products still store **denormalized** category / brand / unit strings for POS & Sheets. Saving an item **ensures** category, brand, and unit masters first (canonical display name / code).

---

## Name key

```ts
normalizeNameKey(name) // NFKC → trim → collapse spaces → lower case
```

Used by categories, brands, units, suppliers. Prevents case-only duplicates.

---

## Code map

| Area | Path |
|------|------|
| Facade | `src/modules/masterData/MasterDataService.ts` |
| Name key | `src/modules/masterData/normalizeNameKey.ts` |
| Brands / units data | `src/data/brands.ts`, `src/data/units.ts` |
| Tax / payment methods | `src/data/taxRates.ts`, `src/data/paymentMethods.ts` |
| Repos | `src/repositories/BrandRepository.ts`, `UnitRepository.ts` |
| UI | `src/pages/utilities/MasterDataPages.tsx` |
| Routes | `/utilities/master-data`, `…/brands`, `…/units`, `…/tax-rates`, `…/payment-methods` |

Bootstrap: Inventory page calls `MasterDataService.bootstrapFromCatalog` (idempotent seed from product strings + default UoM / GST slabs / tenders).

---

## Explicit non-goals (for now)

- Multi-company masters  
- Free-form editable Chart of Accounts  
- Migrating products to FK-only `categoryId` / `brandId` (denormalized names stay for compat)
