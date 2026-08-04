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
| `src/app/` | App bootstrap (`bootstrapApp` starts SyncManager) |
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

`products` · `customers` · `suppliers` · `inventory` · `invoices` · `payments` · `expenses` · `users` · `settings` · `sync_events`

Repositories own exactly one collection each (see `src/repositories/`).

---

## Event system

Supported types (`src/events/EventTypes.ts`):

- `INVOICE_CREATED` / `INVOICE_UPDATED`
- `PAYMENT_RECEIVED` / `PAYMENT_FAILED`
- `PRODUCT_CREATED` / `PRODUCT_UPDATED`
- `INVENTORY_CHANGED`
- `CUSTOMER_CREATED` / `CUSTOMER_UPDATED`
- `SUPPLIER_CREATED`
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
