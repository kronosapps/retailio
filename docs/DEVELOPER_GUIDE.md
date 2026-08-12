# RetailOS Developer Guide

## Adding a feature (example: Customer)

1. Add/extend types in `src/types` or the repository file.
2. Implement CRUD in `CustomerRepository` (Firestore collection `customers`).
3. Publish the right `EventTypes` after successful writes.
4. Expose `CustomerService` in `src/modules/customer` that only calls the repository.
5. UI pages call `CustomerService` — never `fetch` / Firestore / Sheets.

## Adding a sync destination (example: Tally)

1. Implement `SyncProvider` in `src/services/sync/TallySyncProvider.ts`.
2. Register it: `syncManager.registerProvider(new TallySyncProvider())` in bootstrap.
3. Do not touch React or Payment/Invoice modules.

## Adding a payment gateway

1. Implement `PaymentProvider` under `src/modules/payment/providers`.
2. Swap provider inside the payment module hook/service.
3. Still persist via `PaymentRepository.save/update` so events/sync keep working.

## Inventory / stock

1. Item CRUD → `ProductService` → `ProductRepository` (never mutate stock here).
2. Stock changes → `InventoryService.addStock` / `adjustStock` / `recordMovement` (always creates a movement).
3. POS must not call inventory from React — `InventoryEngine` listens to `PAYMENT_RECEIVED`.
4. Refund restock → `InventoryService.restockForRefund` from `RefundService`.
5. Tabular export helpers: `InventoryService.export*Data()`; Excel catalog import/export: `ProductImportService` (`/inventory/import`).
6. Routes: `/inventory/items`, `/inventory/import`, `/inventory/stock`, `/inventory/movements`, `/inventory/categories`.

### Bulk product import

1. Download template / export via `ProductImportService.downloadTemplate()` / `downloadExport()`.
2. Parse + validate via `parseAndValidate(file)` — **no persistence**.
3. Push only after confirmation: `pushToFirestore(preview, { storeId, actorId, onProgress })` → `ProductService.create` in batches.
4. Do not call Firestore or `ProductRepository` from the import page.
5. Template version lives on the Meta sheet; unsupported versions are rejected.

## Reporting / Excel / Sheets export

1. Generate reports via `ReportingService.getSalesReport` (etc.) — read-only.
2. Convert with `ReportExportService.toPayload(report)`.
3. Excel: `ReportExportService.exportExcel(report)` → `ExcelReportExporter` (exceljs).
4. Sheets: `ReportExportService.exportGoogleSheets(report)` → `GoogleSheetsReportExporter` → existing `syncBatch`.
5. Do not call Firestore or Apps Script from `ReportsPage`.
6. Route: `/reports` (admin/manager).

## Purchasing / Suppliers

1. Supplier CRUD → `SupplierService` → `SupplierRepository` (never Firestore from UI).
2. PO draft/issue → `PurchaseOrderService` → `PurchaseOrderRepository` (no stock).
3. GRN → `PurchaseReceivingService.receiveAdHoc` or `receiveAgainstPo` → `GoodsReceiptRepository` + `InventoryService.addStock` (`PURCHASE`, `referenceId = grn.id`). Against PO: block qty > remaining; then `PurchaseOrderService.applyReceipt`.
4. Routes: `/purchasing/suppliers`, `/purchasing/orders`, `/purchasing/goods-received` (admin/manager).
5. Do not increase stock when creating a supplier or PO. Prefer GRN for supplier purchases; Inventory “Add stock” remains for quick/opening adjustments.

## Utilities

1. Landing + tools catalog: `src/modules/utilities/catalog.ts` (RBAC per tool).
2. Hybrid accounting: `AccountingEngine` posts via `AccountingRules` → `JournalRepository`; `AccountingService.getMergedEntries` prefers posted over projection.
3. Expense create: UI → `ExpenseService.save` → `EXPENSE_CREATED` → AccountingEngine.
4. Financial year: `FinancialYearService.getActive()` for period scoping.
5. Excel on utility tables: `UtilitiesExportService` → `ExcelReportExporter` (reuse reporting exporter).
6. Statutory: `StatutoryService` — always `filingReady: false` until full tax data models exist.
7. Routes under `/utilities` are lazy-loaded (`App.tsx` + `UtilitiesLayout` Suspense).
8. Do not delete paid invoices from Recycle Bin — restore masters only.

## Local vs cloud

| Mode | Behavior |
|------|----------|
| Firebase configured | Repository upserts Firestore + keeps local cache |
| Firebase unset | LocalStorage only; events + sync queue still run |
| Sheets URL unset | Sync queue completes with no-op provider skip |

## Debugging sync

- Queue: `localStorage["retailos.sync.queue.v1"]`
- Dead letters: `localStorage["retailos.sync.deadletter.v1"]`
- Event log: `localStorage["retailos.events.log.v1"]`

## Dependency graph (mermaid)

```mermaid
flowchart TD
  UI[React_Pages] --> Mod[Business_Modules]
  Mod --> Repo[Repositories]
  Repo --> FS[(Firestore)]
  Repo --> Local[(localStorage_fallback)]
  Repo --> Pub[EventPublisher]
  Pub --> Bus[EventBus]
  Bus --> Sync[SyncManager]
  Sync --> Queue[SyncQueue]
  Queue --> Provider[GoogleSheetsSyncProvider]
  Provider --> GAS[Apps_Script]
  GAS --> Sheets[(Google_Sheets)]
```
