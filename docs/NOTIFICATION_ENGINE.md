# RetailOS Notification Engine

Channel-agnostic notifications (WhatsApp first). Payment, invoice, and inventory modules never call Meta APIs.

```text
Customer pays
  → PaymentRepository (local + Firestore)
  → PAYMENT_RECEIVED (in-app EventBus)
  → NotificationEngine queues notifications/{id} (status: Queued)
  → Cloud Function onPaymentWritten / onNotificationWritten
  → PDF → Firebase Storage (signed URL)
  → Meta WhatsApp Cloud API template
  → notifications status Sent / Delivered / Read / Failed
```

Cloud Functions also watch `payments` when `status` becomes `Paid`, so delivery still works if the browser tab closed after Firestore write.

---

## Architecture

| Layer | Path | Role |
|-------|------|------|
| UI | `src/modules/notifications/components` | Status panel, analytics cards |
| Services | `src/modules/notifications/services` | Engine, NotificationService, StoreSettings |
| Repository | `src/repositories/NotificationRepository.ts` | Queue / retry / local mirror |
| Cloud Functions | `backend/functions` | WhatsAppProvider, PDF, retries, webhook |
| Docs | this file | Ops + security |

### Providers (future)

```text
NotificationProvider
  ├── WhatsAppProvider   (implemented in Cloud Functions)
  ├── SMSProvider        (stub / future)
  ├── EmailProvider      (stub / future)
  └── PushProvider       (stub / future)
```

Frontend only queues Firestore documents. Providers with secrets live in `backend/functions`.

---

## Environment (backend only)

Set as Firebase Functions secrets / env (never `VITE_*`):

```bash
firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
# or .env for emulator:

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_API_VERSION=v21.0
WHATSAPP_VERIFY_TOKEN=retailos-verify
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

- **Dashboard** — Notification analytics (sent today, failed, pending, delivery/read rates)
- **Invoice details** (`/invoices/:invoiceId`) — WhatsApp status, retry, send again, view receipt
- **Transactions** — click an invoice id to open details
- Existing **ReceiptDialog** remains as print / device WhatsApp fallback (unchanged path)

---

## Retry policy

On API failure: re-queue with `nextRetryAt` at **1m → 5m → 15m** (max 3). Scheduled function `processNotificationRetries` drains due items. After max retries → `Failed` (document retained).

---

## Security

- Tokens only in Cloud Functions
- Storage rules deny direct client write to `/receipts/**` (signed URLs for download)
- Payment Module publishes events only — never imports notifications UI for send
