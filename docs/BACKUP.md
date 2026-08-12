# Backup & Recovery

Local, admin-only snapshots of RetailOS business data.

**Google Sheets is not a backup database.** Architecture treats Sheets as sync / reporting / analytics only. Backups download from Firestore (when configured) + local offline cache.

## Surface

**Utilities → Backup & Recovery** (`/utilities/backup`) — **admin only**.

```text
Backup
├── Database Backup          → JSON (full collections envelope)
├── Product Export           → JSON + Excel
├── Customer Export          → JSON + Excel
├── Invoice Export           → JSON + Excel (invoices + payments + refunds)
├── Inventory Export         → JSON + Excel (stock / lots / movements)
├── Accounting Export        → JSON + Excel (journals / expenses / CoA)
└── Full Business Export     → Database JSON + multi-sheet workbook
```

## Restore

Inspect-only for now:

- Upload a JSON backup → validate format / list sections
- **Apply restore is disabled** until merge/replace rules are safe (append-only journals, idempotent sales/payments)

`RestoreService.apply()` always throws. `canApply` is always `false`.

## Format

```json
{
  "manifest": {
    "formatVersion": 1,
    "kind": "database",
    "exportedAt": "…",
    "storeId": "…",
    "counts": { "products": 12, "invoices": 40 }
  },
  "collections": { "products": […], "invoices": […] },
  "meta": {
    "chartOfAccounts": […],
    "excluded": ["retailos.sync.queue.v1", "…"]
  }
}
```

Excluded from database dumps: sync queue / dead letter / meta, event log, auth session.

## Architecture

```text
BackupPage (admin)
  → BackupService / RestoreService
      → repositories (hydrate + list)
      → local download (JSON / Excel)
```

No Sheets provider. No SyncManager enqueue for backup files.

| Layer | Path |
|-------|------|
| UI | `src/pages/utilities/BackupPage.tsx` |
| Module | `src/modules/backup/` |
| Audit | `BACKUP_EXPORTED` in ops audit when an export downloads |

## Policy

- Prefer **Full Business Export** before risky migrations or device wipe
- Keep files offline / encrypted at rest outside the app
- Do not rely on Sheets rows to rebuild stock or GL
