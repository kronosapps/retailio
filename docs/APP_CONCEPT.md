# RetailOS — Full App Concept Brief (for AI / GPT context)

> Snapshot of the product, architecture, and modules as of 2026-08.
> Use this as system/context when continuing development or answering questions about RetailOS.
> Repo: Vite + React 19 + TypeScript POS / store ops app. Deployed to GitHub Pages.
> Package name: `retailos`. Homepage: `https://kronosapps.github.io/retailio/`

---

## 1. What it is

**RetailOS** is a browser-based **point-of-sale and store operations** app for a single retail/food store (India-oriented: UPI, cash, GST, INR/paisa).

Primary jobs:

- Take orders and collect payment at POS (cash + manual UPI)
- Persist invoices, payments, inventory, customers
- Sync business events to Google Sheets (reporting/backup only)
- Role-based staff login (admin / manager / cashier)
- Admin banking ledger (cash + UPI opening balances + in/out tracking)
- Receipts (UI + optional WhatsApp webhook)
- Dashboard analytics, transactions, refunds, end-of-day style reporting

**Not** a multi-tenant SaaS yet — designed single-store (`VITE_STORE_ID`), but architecture is event/repository based so multi-store can plug in later.

---

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 19, React Router 7, Tailwind 4, shadcn/Base UI, Lucide, Framer Motion, Recharts |
| State / forms | Zustand (some areas), React Hook Form + Zod, TanStack Query |
| Build | Vite 8, TypeScript, React Compiler (babel), PWA plugin |
| Backend data | Firebase Auth + Firestore (when configured); **localStorage fallback** always |
| Sync / reporting | Google Apps Script webhook → Google Sheets |
| Optional server | Firebase Cloud Functions under `backend/functions` (staff callables exist but free-tier path avoids Blaze) |
| Money | Amounts tracked in **paisa** (integer); display in rupees |
| Deploy | `npm run deploy` → `gh-pages` |

---

## 3. Hard architecture rules (do not violate)

```text
React (UI / pages)
  → Business Module (Service)
    → Repository
      → Firestore (+ localStorage cache/fallback)
        → EventPublisher → EventBus
          → SyncManager → SyncProvider → Google Sheets
```

- **React must not** call Firestore, Google Sheets, `fetch`, or `axios` for business data.
- **Firestore is source of truth** when Firebase is configured; Sheets is sync/reporting only.
- Repositories own **one collection** each; publish domain events after successful writes.
- Config lives in `src/core/config/env.ts` — no scattered `import.meta.env`, no secrets in UI hardcode.
- Offline-capable: if Firebase unset, localStorage-only; sync queue still runs; Sheets no-ops if URL unset.

Canonical docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md).

---

## 4. Folder map

| Path | Role |
|------|------|
| `src/app/` | `bootstrapApp()` — starts SyncManager, NotificationEngine, BankingEngine, product seed |
| `src/pages/` | Route screens (orchestration only) |
| `src/layouts/` | `AppLayout` (admin shell), `PosLayout` (POS shell) |
| `src/modules/` | Business domains: payment, invoice, pos, inventory, customer, refund, receipt, dashboard, reports, staff, banking, notifications, expense, products |
| `src/repositories/` | Firestore/local CRUD + events |
| `src/core/firebase/` | Firebase init, auth, Firestore helpers, createStaffUser (secondary app) |
| `src/core/config/env.ts` | All env |
| `src/services/sync/` | SyncManager, queue, retries, GoogleSheetsSyncProvider |
| `src/events/` | EventBus, Publisher, Subscriber, EventTypes |
| `src/data/` | Local helpers / seeds (products.json, menu, invoices cache helpers, etc.) |
| `src/providers/` | AuthProvider |
| `src/types/` | Shared types (`user.ts`, `domain.ts`, …) |
| `docs/` | Architecture, Firebase, WhatsApp, Sheets, notifications |
| `backend/functions/` | Optional Cloud Functions (staff, WhatsApp, notifications) |

---

## 5. Auth & roles

### Login UX

- Everyone signs in with **username + passcode** (not email in the UI).
- When Firebase is configured: Auth email = `{username}@retailos.local`, password = passcode.
- Profile: Firestore `users/{uid}` with `role`, `username`, `displayName`, `storeId`, `active`.
- When Firebase incomplete: mock users from env (`VITE_ADMIN_*`, `VITE_MANAGER_*`, `VITE_CASHIER_*`).

### Default local / seed credentials

| Username | Passcode | Role |
|----------|----------|------|
| admin | admin123 | admin |
| manager | mgr123 | manager |
| cashier | cash123 | cashier |

### RBAC (`src/modules/staff/permissions.ts`)

| Route | Roles |
|-------|-------|
| `/` Dashboard | admin, manager |
| `/pos` POS | admin, manager, cashier |
| `/inventory` | admin, manager |
| `/customers` | admin, manager |
| `/transactions` | admin, manager |
| `/invoices/:id` | admin, manager |
| `/banking` | **admin only** |
| `/options` Admin Options | admin |
| `/staff` Staff management | admin |

- Cashier home = `/pos`; manager/admin home = `/`.
- Guards: `RequireAuth`, `RequireGuest`, `RequirePermission`.

### Staff creation (Spark / free tier)

- No Blaze required: secondary Firebase Auth app in browser (`createStaffUser`) + admin Firestore rules on `users`.
- Cloud Functions `createStaff` / `listStaff` exist but are optional (need Blaze).
- Docs: [`FIREBASE_AUTH.md`](./FIREBASE_AUTH.md).

---

## 6. Routes (`src/App.tsx`)

- `/login` — guest only
- Authenticated + permissioned:
  - PosLayout: `/pos`
  - AppLayout: `/`, `/inventory`, `/customers`, `/transactions`, `/invoices/:invoiceId`, `/options`, `/banking`, `/staff`
- `*` → redirect `/`

---

## 7. Domain modules (behavior)

### POS (`src/modules/pos`, `PosPage`)

- Catalog from menu/products; cart with discounts, friends & family %, occasion, loyalty punch rewards.
- **3 in-memory POS sessions** (lanes) — switch carts; blocked while payment dialog open; **not** persisted across full page refresh.
- Charge → invoice create → payment dialog → on paid clear session cart + show receipt.

### Payment (`src/modules/payment`)

- Methods: **Cash** and **Manual UPI** (QR / last-4 confirm).
- Cash UX: Collect Cash → keypad (whole rupees) → due / received / change → Mark as Paid when received ≥ due.
- UPI: Mark as Paid → last-4 confirmation.
- Customer: default Walk-in; search name/phone autofill from `CustomerService`.
- Persist via `PaymentRepository`; emits `PAYMENT_RECEIVED`.
- Dialogs use `disablePointerDismissal` (no accidental outside-click dismiss).
- Providers pattern: `PaymentProvider` / `ManualUPIProvider` for future gateways.

### Invoice (`InvoiceService` / `InvoiceRepository`)

- Created from POS; hydrates from Firestore on list/get (merge into local) so **cross-device sync works**.
- Events: `INVOICE_CREATED`, `INVOICE_UPDATED`.

### Inventory / Products

- Stock changes via inventory module/repo; product catalog seeded from `src/data/products.json` on bootstrap (`ProductService.ensureCatalogSeeded`).

### Customers

- CRUD via `CustomerService` → `CustomerRepository`; used at POS for receipt greeting (`Hi {name}`).

### Refunds

- Refund dialog/service; `RefundRepository`; events `REFUND_CREATED`, `PAYMENT_REFUNDED`, etc.
- Restock option; method tracked for banking outflows.

### Receipts

- `buildReceipt` + `ReceiptDialog`; optional WhatsApp via `VITE_WHATSAPP_WEBHOOK_URL` (server webhook only — no Meta tokens in browser). See [`WHATSAPP_RECEIPTS.md`](./WHATSAPP_RECEIPTS.md).

### Dashboard / Reports

- Analytics from invoices/payments (date ranges, charts, customer insights).
- Transactions page; End-of-Day service.

### Notifications

- `notificationEngine` started at bootstrap; queue/retry patterns; docs in [`NOTIFICATION_ENGINE.md`](./NOTIFICATION_ENGINE.md).

### Banking (admin)

- Route `/banking`; module `src/modules/banking/`.
- **Opening balances**: Cash in hand + UPI (seed from env when local store empty).
- **Ledger**: in/out per channel; sources: opening, sale, refund, adjustment, mock.
- **Live sync**: `BankingEngine` subscribes to payment received / refund events and posts ledger entries.
- **Mock seed** entries for empty store demo.
- **Account + GST display** from env only (not hardcoded in UI strings beyond env fallbacks).
- **Any mutation** requires banking admin passcode (`VITE_BANKING_PASSCODE`, falls back to admin passcode).
- Unlock UI session + passcode re-confirmed on save (`BankingService.assertCanEdit`).
- Storage: localStorage `retailos.banking.v1` (mock/local for now — not Firestore yet).

### Staff

- Admin Staff page: list/create staff; roles admin|manager|cashier.

### Expenses / Suppliers

- Types/events and repos exist; Sheets sync aware; less prominent in main nav depending on UI completeness.

---

## 8. Data & sync

### Firestore collections (typical)

`products`, `customers`, `suppliers`, `inventory`, `invoices`, `payments`, `expenses`, `users`, `settings`, `sync_events`  
(Refunds may use payments/refunds pattern via RefundRepository.)

### Cross-device sync design

- Writes: localStorage + best-effort Firestore.
- Reads: repositories **hydrate** from Firestore on `list()` / `getById` and merge into local stores — critical so Device A sales appear on Device B dashboard.

### Domain events (`src/events/EventTypes.ts`)

`INVOICE_*`, `PAYMENT_*`, `PRODUCT_*`, `INVENTORY_CHANGED`, `CUSTOMER_*`, `REFUND_*`, `PAYMENT_REFUNDED`, `ORDER_CANCELLED`, `NOTIFICATION_*`, `SUPPLIER_CREATED`, `EXPENSE_CREATED`.

### Sync queue

- States: Pending → Syncing → Completed | Failed → Retrying → DeadLetter (3 retries).
- Offline: queue in localStorage; drains on `online`.
- Keys: `retailos.sync.queue.v1`, `retailos.sync.deadletter.v1`, `retailos.events.log.v1`.
- Provider POST shape: `{ action, sheet, data }` to Apps Script.

### Wipe script

- `npm run db:wipe` clears Firestore app collections but **keeps `users`**.
- After wipe: also clear browser `retailos.*` localStorage or stale offline data remains.

---

## 9. Environment variables (concept)

All via `VITE_*` → `env` object.

- Store: `VITE_STORE_ID`
- Firebase: `VITE_FIREBASE_*`
- Sheets: `VITE_GOOGLE_SCRIPT_URL`
- WhatsApp: `VITE_WHATSAPP_WEBHOOK_URL`
- Local auth fallbacks: `VITE_ADMIN_*`, `VITE_MANAGER_*`, `VITE_CASHIER_*`
- Banking: `VITE_BANKING_PASSCODE`, opening cash/UPI rupees, `VITE_BANK_*`, `VITE_GSTIN`, `VITE_GST_*`

Never put Meta tokens or service-account secrets in Vite env for the browser.

---

## 10. Money & India-specific UX

- Currency: INR; internal unit **paisa**.
- Tender: Cash + UPI (manual confirmation, not live bank API).
- GST identity shown in Banking from env (GSTIN, legal/trade name, address).
- Receipts and WhatsApp oriented to store customer messaging.

---

## 11. Bootstrap sequence

`main.tsx` → `bootstrapApp()`:

1. `syncManager.start()`
2. `notificationEngine.start()`
3. `bankingEngine.start()`
4. Seed product catalog if needed

---

## 12. Current known limitations / intentional mocks

- Banking ledger is **localStorage + mock seed**, not Firestore-backed yet.
- POS multi-sessions are **memory-only** (lost on full refresh).
- Manual UPI (no PhonePe/Cashfree/Razorpay live settlement API yet — provider interface ready).
- Cloud Functions staff path optional; free-tier uses client secondary Auth app.
- Single store id from env.
- Some older architecture notes may lag slightly behind EventTypes (refunds/notifications added).

---

## 13. How to extend (patterns for AI implementers)

1. **New entity**: types → Repository (Firestore + local + events) → Module Service → Page UI. Never skip layers.
2. **New sync target**: implement `SyncProvider`, register in bootstrap — do not touch Payment/Invoice React.
3. **New payment gateway**: implement `PaymentProvider`; still persist via PaymentRepository.
4. **New admin page**: add route + `STAFF_NAV_ITEMS` roles + layout icon if needed.
5. **Env-backed display data**: add to `env.ts` + `.env.example`; read via service — do not hardcode in JSX.

---

## 14. Product voice / UX notes

- POS-first for cashiers; dashboard for managers.
- Payment dialogs must not dismiss on outside click.
- Banking edits always re-ask admin banking passcode.
- Prefer existing UI components under `src/components/ui`.
- When Firebase + multiple browsers: rely on repository hydrate, not localStorage-only reads.

---

## 15. One-line elevator pitch

RetailOS is an offline-capable, Firebase-backed retail POS with role-based staff, cash/UPI checkout, Sheets sync, receipts, and an admin banking ledger for cash and UPI balances — built with strict UI → service → repository → events → sync layering.
