# Payment Module

Independent payment layer for RetailOS. Billing creates an invoice, then calls `openPayment(invoice)`. All UPI/QR/provider logic stays inside this module.

## Billing integration

```ts
import { createInvoice, toPayableInvoice } from "@/data/invoices"
import { openPayment } from "@/modules/payment"

const sale = createInvoice({ /* lines, totals, ... */ })
openPayment(toPayableInvoice(sale), {
  onPaid: () => clearCart(),
  onCancelled: () => { /* optional */ },
})
```

Render `<PaymentDialog />` once near the POS shell (e.g. `PosPage` or `PosLayout`).

## Flow

1. Invoice created (`paymentStatus: Pending`)
2. `openPayment(invoice)` opens the dialog
3. **Payment session** created first (`PAY-YYYYMMDD-#####`)
4. UPI URL + QR are derived from that session (QR is not the payment)
5. Cashier waits, then **Mark as Paid** (manual verification)
6. Invoice payment fields updated; optional Sheets webhook POST

## Payment session

```ts
{
  paymentId: "PAY-20260804-00051",
  invoiceId: "INV-20260804-00051",
  transactionReference: "INV-20260804-00051",
  amount: 548.5,
  status: "Pending",
  qrGeneratedAt: "...",
  qrExpiresAt: "..."
}
```

- Retry / regenerate → new session (`PAY-…-2`, new `tr`)
- Partial/split, PhonePe verify, Sheets reconcile, and receipt printing all key off `paymentId` / `transactionReference`

## Transaction reference

Format: `INV-YYYYMMDD-#####` on first attempt. Regenerating never reuses a prior `tr` (`…-R2`, …).

## Settings (localStorage)

- Merchant name / UPI ID / mobile
- Currency (`INR`)
- Payment timeout (default 10 minutes)
- Optional Google Sheets webhook URL

No secret API keys are stored in the frontend.

## Provider interface

```ts
interface PaymentProvider {
  generatePayment()
  verifyPayment()
  refund()
  cancel()
}
```

Current: `ManualUPIProvider`  
Future: `PhonePeProvider`, `CashfreeProvider`, `RazorpayProvider` — implement the interface and swap in the hook without changing Billing.

## Sheets webhook payload

```json
{
  "invoiceNumber": "INV-20260804-00051",
  "transactionReference": "INV-20260804-00051",
  "amount": 548.5,
  "paymentMethod": "UPI",
  "status": "Paid",
  "paidAt": "2026-08-04T12:00:00.000Z"
}
```

## Security

- Only merchant VPA is embedded in the UPI URL
- Never put PhonePe/Razorpay secrets in Vite `VITE_*` env for browser use
- Prefer server-side verification when API providers are added
