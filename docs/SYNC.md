# Offline Sync Reliability

Hardened local-first sync for production POS networks.

```text
Pending → Syncing → Completed
                 ↘ Failed → Retrying → DeadLetter (after 3 retries)
```

## Sync Center

**Utilities → Sync Center** (`/utilities/sync`)

| Surface | Meaning |
|---------|---------|
| Last successful sync | Latest completed queue item / EOD run |
| Pending | Pending, Syncing, Retrying, Failed (in-flight) |
| Failed | Items with errors still in queue |
| Dead letter | Exhausted retries — Retry / Retry all |
| View error | Full error text for an item |
| Process now | Force drain when online |

## Idempotency

### Payments (critical)

- Firestore / local: stable `paymentId` as document id (upsert).
- `PAYMENT_RECEIVED` / `PAYMENT_FAILED` publish **only** on status transition (not on every Paid save).
- Payload includes `idempotencyKey: payment:{paymentId}`.
- Sync queue dedupes by `eventId` and `idempotencyKey`.
- Sheets: `upsert` by `paymentId` (update Apps Script from [`GOOGLE_SHEETS_SYNC.md`](./GOOGLE_SHEETS_SYNC.md)).

### Queue

- Same `eventId` → return existing item.
- Same business key already Pending/Completed → skip twin enqueue.
- Same key in dead letter → revive instead of duplicating.

### Sheets

Redeploy the Apps Script with `upsert` / `batchUpsert` + `keyField`. Until then, retries may still append if the script is old.

## Incomplete sales

Sync Center also lists **sale transaction** rows that are not `Completed` / `Cancelled` (checkout boundaries). Resume payment, cancel unpaid, or retry stock — see [`SALE_TRANSACTIONS.md`](./SALE_TRANSACTIONS.md).

## Storage keys

| Key | Role |
|-----|------|
| `retailos.sync.queue.v1` | Active queue |
| `retailos.sync.deadletter.v1` | Dead letters |
| `retailos.sync.meta.v1` | `lastSuccessfulSyncAt` |

## Architecture

| Layer | Path |
|-------|------|
| UI | `SyncCenterPage` |
| Service | `SyncService` |
| Manager | `SyncManager` (bootstrap) |
| Queue | `SyncQueue` |
| Keys | `syncIdempotency.ts` |
| Provider | `GoogleSheetsSyncProvider` |
