# RetailOS Notification Engine

Channel-agnostic notifications (WhatsApp first) plus **staff soft alerts** on the same queue.

```text
Customer pays
  → PaymentRepository (local + Firestore)
  → PAYMENT_RECEIVED (in-app EventBus)
  → NotificationEngine queues notifications/{id} (status: Queued)
    → Cloud Function onPaymentWritten / onNotificationWritten
    → PDF → Firebase Storage (signed URL)
    → Meta WhatsApp Cloud API template
    → notifications status Sent / Delivered / Read / Failed

Business trigger (stock / cash / sync / AR / AP …)
  → NotificationEngine → AlertService
  → notifications/{id} channel=in_app audience=staff (status: Delivered)
  → SoftAlertsBell inbox (color-coded)
  → Cloud Function no-ops in_app
```

Cloud Functions also watch `payments` when `status` becomes `Paid`, so delivery still works if the browser tab closed after Firestore write.

---

## Architecture

| Layer | Path | Role |
|-------|------|------|
| UI | `SoftAlertsBell`, status panel, analytics | Staff inbox + WhatsApp status |
| Services | `NotificationEngine`, `AlertService`, `NotificationService` | Triggers + queue helpers |
| Thresholds | `alertThresholds.ts` | Large discount/refund, variance, AR/AP floors |
| Repository | `NotificationRepository.ts` | Queue / retry / markRead / local mirror |
| Cloud Functions | `backend/functions` | WhatsAppProvider only (skips `in_app`) |
| Docs | this file | Ops + security |

### Providers

```text
NotificationProvider
  ├── WhatsAppProvider   (implemented in Cloud Functions)
  ├── in_app             (client SoftAlertsBell — live)
  ├── SMSProvider        (stub / future)
  ├── EmailProvider      (stub / future)
  └── PushProvider       (stub / future)
```

Frontend only queues Firestore documents. Providers with secrets live in `backend/functions`.

---

## Staff alerts

| Alert | Trigger |
|-------|---------|
| Low / out of stock | `INVENTORY_CHANGED` + aging scan (`StockAnalyticsService`) |
| Expiring stock | Aging scan (lot expiry window) |
| Large discount | `PAYMENT_RECEIVED` when discount ≥ ratio + floor |
| Large refund | `PAYMENT_REFUNDED` above refund floor |
| Cash variance | `SHIFT_CLOSED` when \|variance\| ≥ floor |
| Failed sync | `SYNC_FAILED` (sync dead letter) |
| Failed payment | `PAYMENT_FAILED` |
| Pending purchase | Open ISSUED/PARTIAL POs (scan) |
| Outstanding supplier | AP remaining ≥ floor (scan) |
| Outstanding customer | Customer `outstandingPaisa` ≥ floor (scan) |

Aging scans run on engine start and every 15 minutes. Duplicates share a `dedupeKey` within a configurable window (default 6h).

**Admin Options → Staff alerts** edits thresholds, low-stock digest, role mutes, and Telegram chat id.

**Low-stock digest** (default on): one daily `low_stock` card; `out_of_stock` stays per-SKU + critical.

**Role mutes**: raised for audit, hidden in that role’s bell (cashier defaults mute AR/AP/low-stock noise).

**Telegram critical**: when enabled + chat id set, critical `in_app` raises also queue `channel=telegram` for CF (`TELEGRAM_BOT_TOKEN` secret; optional `TELEGRAM_CHAT_ID` default).

**Deep-links**: bell opens SKU / PO / supplier / customer / invoice focused routes via `buildAlertHref`.

**Multi-device read**: `subscribeQueryDocuments` on `channel == in_app` mirrors `readAt` across devices.

Bell UI lives in `AppLayout` + `PosLayout`. Soft cards are tone-coded: rose (critical stock/sync/payment), amber (low stock / expiry / cash), violet (discount/refund), sky (pending PO), slate (AR/AP).

---

## Environment (backend only)

Set as Firebase Functions secrets / env (never `VITE_*`):

```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
# optional night-phone:
# firebase functions:secrets:set TELEGRAM_BOT_TOKEN
# or .env for emulator:

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_API_VERSION=v21.0
WHATSAPP_VERIFY_TOKEN=retailos-verify
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...   # optional default when alert meta omits chat id
```

Frontend has **no** WhatsApp credentials.

---

## Store settings (Firestore)

Document: `settings/store_{storeId}`

Fields: business name, WhatsApp number, phone number ID (public), logo URL, receipt footer, support number, address, GST.

Access token is **never** stored in Firestore.

Edit in **Admin Options → Store settings**.

---

## WhatsApp template

Approve in Meta Business Manager, e.g. `receipt_notification`:

```text
Hello {{1}}
Thank you for shopping with {{2}}
Invoice Number: {{3}}
Amount Paid: ₹{{4}}
Payment Method: {{5}}
Your receipt: {{6}}
```

---

## Deploy functions

```bash
cd backend/functions
npm install
npm run build
cd ../..
firebase deploy --only functions,storage,firestore
```

Enable **Firebase Storage** in the console for receipt PDFs.

---

## UI

- **Header bell** — SoftAlertsBell (staff ops alerts)
- **Dashboard** — Notification analytics (WhatsApp only; excludes `in_app`)
- **Invoice details** (`/invoices/:invoiceId`) — WhatsApp status, retry, send again, view receipt
- **Transactions** — click an invoice id to open details
- Existing **ReceiptDialog** remains as print / device WhatsApp fallback (unchanged path)

---

## Retry policy

On API failure: re-queue with `nextRetryAt` at **1m → 5m → 15m** (max 3). Scheduled function `processNotificationRetries` drains due items. After max retries → `Failed` (document retained). Staff `in_app` alerts are never retried by CF.

---

## Security

- Tokens only in Cloud Functions
- Storage rules deny direct client write to `/receipts/**` (signed URLs for download)
- Payment Module publishes events only — never imports notifications UI for send
