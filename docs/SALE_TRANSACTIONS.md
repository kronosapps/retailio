# Sale transactions — data integrity boundaries

POS checkout is not one atomic DB transaction across invoice, payment, banking, and stock. RetailOS keeps **stock deduction after payment only**, and records an explicit **sale transaction** overlay so partial progress is visible and recoverable.

## State machine

```text
Cart
 ↓
CheckoutStarted
 ↓
InvoicePending
 ↓
InvoiceCreated
 ↓
PaymentPending
 ↓
PaymentConfirmed
 ↓
InvoiceFinalized
 ↓
StockFinalized
 ↓
Completed
```

Terminal / recovery: `Failed`, `Cancelled`.

| Status | Meaning | Stock |
|--------|---------|-------|
| CheckoutStarted → InvoiceCreated | Invoice may exist unpaid | Untouched |
| PaymentPending | Payment session open | Untouched |
| PaymentConfirmed → InvoiceFinalized | Paid; postings in flight | Not yet / in flight |
| StockFinalized → Completed | FEFO deduct done (idempotent) | Deducted |
| Failed | Engine or charge error | Depends — use Retry stock if paid |
| Cancelled | Abandoned unpaid checkout | Untouched |

## Policy (unchanged)

- **Never** deduct stock on invoice create.
- Deduct only on `PAYMENT_RECEIVED` via `InventoryEngine` → `InventoryService.deductForSale` (idempotent per invoice+SKU).
- Unpaid / cancelled payment → stock stays.

## Wiring

| Step | Who |
|------|-----|
| `begin` / `InvoicePending` / `attachInvoice` | `PosPage.chargeOrder` |
| `PaymentPending` | `createPaymentSession` |
| `PaymentConfirmed` / `InvoiceFinalized` | `SaleTransactionEngine` on `PAYMENT_RECEIVED` |
| `StockFinalized` / `Completed` | `InventoryEngine` after successful deduct |
| `Failed` | Charge catch, `PAYMENT_FAILED`, stock deduct catch |
| `Cancelled` | `SALE_CANCELLED` / `ORDER_CANCELLED` / recovery Cancel unpaid |

## Recovery UI

**Utilities → Sync Center** → Incomplete sales

- **Resume pay** — reopen payment for unpaid invoice
- **Cancel unpaid** — cancel open sessions + mark Cancelled (stock never moved)
- **Retry stock** — re-run idempotent deduct for paid rows stuck before `StockFinalized`

## Storage

| Layer | Path |
|-------|------|
| Local | `retailos.sale_transactions.v1` |
| Firestore | `sale_transactions` |
| Types / service | `src/modules/saleTransaction/` |
| Repository | `SaleTransactionRepository` |

## Why this exists

Without the overlay you can still end up with “invoice exists, payment failed” — that is recoverable because stock never moved. What you could not see was **paid but stock engine failed**, or **checkout abandoned mid-flight**. The sale transaction makes those states first-class.
