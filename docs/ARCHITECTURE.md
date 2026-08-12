# RetailOS Architecture

Firestore is the **only** source of truth (when configured).  
Google Sheets is for **sync / reporting / backup / analytics** — not the database.

React components must not call Firestore, Google Sheets, `fetch`, or `axios` for business data.

---

## Dependency rule

```text
React (UI)
  → Business Module
    → Repository
      → Firestore (+ local fallback)
        → Event Bus
          → Sync Manager
            → Sync Provider
              → Google Sheets (Apps Script)
```

No layer may skip another layer.

---

## Folder map

| Path | Responsibility |
|------|----------------|
| `src/app/` | `bootstrapApp` starts SyncManager, NotificationEngine, BankingEngine, InventoryEngine, AccountingEngine |
| `src/components/` | Shared UI primitives / shells |
| `src/pages/` | Route-level screens (UI orchestration only) |
| `src/modules/` | Business modules (Invoice, Payment, Inventory, …) |
| `src/repositories/` | One Firestore collection each; publish events |
| `src/core/firebase/` | Firebase infrastructure (init, auth, Firestore helpers) |
| `src/core/config/` | Centralized env (`env.ts`) |
| `src/services/sync/` | SyncManager, queue, retries, Sheets provider |
| `src/googleSheets/` | Low-level Apps Script POST client (provider-only) |
| `src/shared/` | Pure shared helpers |
| `src/events/` | EventBus, Publisher, Subscriber, EventTypes, logs |
| `src/sync/` | Re-export of `services/sync` |
| `src/providers/` | React context providers (Auth, …) |
| `src/types/` | Shared domain types |
| `src/utils/` | Pure helpers (ids, …) |
| `src/hooks/` | UI-only hooks (e.g. online status) |
| `src/data/` | Legacy/local helpers still used by repositories |
| `docs/` | Architecture & developer guides |

---

## Firestore collections

`products` · `customers` · `suppliers` · `purchase_orders` · `goods_receipts` · `purchase_invoices` · `supplier_payments` · `inventory` · `inventory_movements` · `categories` · `invoices` · `payments` · `refunds` · `expenses` · `journal_entries` · `users` · `settings` · `sync_events`

### Purchasing (Phases 1–5)

- Nav: `/purchasing` (admin/manager) — Suppliers, POs, Goods Received, Purchase Invoices, Supplier Payments, Statements (returns later).
- **Suppliers:** `SupplierService` → `SupplierRepository` → `suppliers` + `retailos.suppliers.v1`.
- **Purchase Orders:** `PurchaseOrderService` → `PurchaseOrderRepository` → `purchase_orders`. Draft → Issue; does **not** change stock.
- **Goods Received:** `PurchaseReceivingService` → `goods_receipts` → `InventoryService.addStock({ type: "PURCHASE", referenceId: grnId })`.
- **Purchase Invoices (AP):** `SupplierInvoiceService.createFromGrns` / `post` → `purchase_invoices`. Dr Inventory / Cr AP via `PURCHASE_INVOICE_POSTED` → `AccountingEngine`. No stock change.
- **Supplier Payments:** `SupplierPaymentService.payInvoice` → `supplier_payments`. Dr AP / Cr Cash|UPI; banking ledger out via `SUPPLIER_PAYMENT_RECORDED`.
- Events: `SUPPLIER_*`, `PURCHASE_ORDER_*`, `GOODS_RECEIVED`, `PURCHASE_INVOICE_*`, `SUPPLIER_PAYMENT_RECORDED` (live Sheets).
- Stock only from posted GRN; AP only from posted purchase invoice; expenses remain OpEx.

Repositories own exactly one collection each (see `src/repositories/`).

---

## Inventory model

- **Product / Item** (`products`): sellable definition (SKU, barcode, category name, prices, GST, `reorderLevel`, `active`).
- **Stock** (`inventory`): cached on-hand quantity per SKU (derived/updated by movements).
- **Movements** (`inventory_movements`): append-only ledger (`OPENING_STOCK`, `PURCHASE`, `SALE`, `RETURN`, `DAMAGE`, `WASTAGE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`).
- **Categories** (`categories`): first-class names with active flag; products still store category as a string for POS/Sheets compat.

Stock status: Out ≤ 0 · Low ≤ reorderLevel · else In Stock.

POS paid sale → `PAYMENT_RECEIVED` → `InventoryEngine` → `InventoryService.deductForSale` (SALE movements).  
Refund with restock → `InventoryService.restockForRefund` (RETURN movements).

Export readiness: `InventoryService.exportProductsData` / `exportCurrentStockData` / `exportInventoryMovementsData` return tabular rows for future CSV/Excel/Sheets without Excel deps in UI.

Admin UI: `/inventory/items|import|stock|movements|categories` (admin/manager).

### Bulk product import (Excel)

```text
Excel (.xlsx)
  → ExcelProductParser
  → ProductImportValidator
  → Preview (UI)
  → User confirms “Push to Firestore”
  → ProductImportService
  → ProductService.create
  → ProductRepository
  → Firestore / localStorage + PRODUCT_CREATED → EventBus → SyncManager
```

- Module: `src/modules/productImport/` (template v1.0).
- Mode: **Add New only** — existing SKUs are `DUPLICATE` and skipped (no overwrite).
- Does **not** create inventory stock or movements.
- UI never writes Firestore; upload/validate are read-only until Push.
- Reuses `exceljs` (same as reporting). Extension point: same parser/template pattern for customers/suppliers later.

---

## Reporting module

Read-only analytical layer under `src/modules/reporting/`.

```text
Repositories / domain services
        ↓
ReportingService (Sales / Inventory / Stock / Items / Dashboard)
        ↓
Normalized ReportResult + ReportExportPayload
        ↓
   ┌────┴────┐
Excel (.xlsx)   Google Sheets (via existing SyncProvider.syncBatch)
```

- **UI** (`/reports`) calls only `ReportingService` + `ReportExportService` — never Firestore, Sheets, or fetch.
- **Excel** and **Sheets** sit side-by-side; neither depends on the other.
- Money stays in **paisa** until display/export formatting.
- Existing `src/modules/reports/` (Transactions / End of Day) remains for day ops; reporting is historical/exportable.

---

## Utilities & Accounting

Administrative workspace at `/utilities` (`src/modules/utilities`, `src/modules/accounting`, `src/modules/financialYear`, `src/modules/statutory`). Routes are **React.lazy** code-split.

```text
Domain events (PAYMENT_RECEIVED / REFUND_* / EXPENSE_CREATED)
        ↓
AccountingRules → JournalRepository (posted GL)
        ↓
AccountingService merges posted + AccountingProjectionService backfill
        ↓
Trial Balance / Balance Sheet / Daybook / Account Statement
```

- **Hybrid GL:** posted journals win per `referenceType+referenceId`; projection fills historical gaps (openings/inventory snapshot). Not audited books.
- **Expense create:** `/utilities/expenses` → `ExpenseService.save` only (never Firestore from UI).
- **Excel:** `UtilitiesExportService` → shared `ExcelReportExporter` (no second Excel stack).
- **FinancialYearService** — Indian FY (Apr–Mar), shared by accounting & statutory views.
- **Statutory scaffold** (`StatutoryService`): GST operational summary + B2B/B2C when `customer.gstin` exists; TCS / Form 27EQ typed empty tables with `filingReady: false` + missing-field lists — never claim government compliance.
- Recycle Bin restores soft-deactivated products only — not paid financial transactions.

---

## Event system

Supported types (`src/events/EventTypes.ts`):

- `INVOICE_CREATED` / `INVOICE_UPDATED`
- `PAYMENT_RECEIVED` / `PAYMENT_FAILED`
- `PRODUCT_CREATED` / `PRODUCT_UPDATED`
- `INVENTORY_CHANGED` / `INVENTORY_MOVEMENT_CREATED` / `STOCK_ADJUSTED`
- `CATEGORY_CREATED` / `CATEGORY_UPDATED`
- `CUSTOMER_CREATED` / `CUSTOMER_UPDATED`
- `REFUND_CREATED` / `REFUND_UPDATED` / `PAYMENT_REFUNDED`
- `SUPPLIER_CREATED` / `SUPPLIER_UPDATED`
- `PURCHASE_ORDER_CREATED` / `PURCHASE_ORDER_UPDATED` / `PURCHASE_ORDER_ISSUED`
- `GOODS_RECEIVED`
- `PURCHASE_INVOICE_CREATED` / `PURCHASE_INVOICE_POSTED` / `PURCHASE_INVOICE_UPDATED`
- `SUPPLIER_PAYMENT_RECORDED`
- `EXPENSE_CREATED`

Flow: repository write → `EventPublisher.publish` → `EventBus` → `SyncManager` enqueues → provider.

Event audit log: `localStorage` key `retailos.events.log.v1`.

---

## Sync layer

- **SyncQueue** — Pending → Syncing → Completed | Failed → Retrying → DeadLetter  
- **RetryManager** — 3 attempts, then dead letter (never silent drop)  
- **Offline** — queue survives in `localStorage`; drains on `window.online`  
- **GoogleSheetsSyncProvider** — `VITE_GOOGLE_SCRIPT_URL`  

POST body:

```json
{
  "action": "insert",
  "sheet": "Payments",
  "data": { }
}
```

---

## Payment / Invoice flows

**Invoice**

`PosPage` → `InvoiceService.create` → `InvoiceRepository.save` → Firestore/local → `INVOICE_CREATED` → Sync

**Payment**

`PaymentDialog` → `paymentRepository.update(Paid)` → Firestore/local → `PAYMENT_RECEIVED` → Sync → Sheets

The Payment Module does **not** know Google Sheets exists.

---

## Configuration (`.env`)

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_APP_ID=
VITE_GOOGLE_SCRIPT_URL=
```

No secrets in source. If Firebase is unset, repositories keep using localStorage so POS stays offline-capable.

---

## Backward compatibility

- Existing POS cart / UPI / loyalty flows unchanged at UX level  
- Invoice/payment localStorage keys preserved  
- Optional legacy Sheets URL in Payment Settings still accepted as fallback  
- `@/modules/payment` public API (`openPayment`, `PaymentDialog`, …) preserved  

---

## Future-ready

Multi-store, RBAC, PhonePe/Cashfree/Razorpay providers, Tally/Power BI sync providers, GST, printers, WhatsApp receipts — plug new `SyncProvider` / `PaymentProvider` implementations without rewriting React or billing modules.
