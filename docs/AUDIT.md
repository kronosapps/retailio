# Operational Security & Audit

Store-wide, append-only mutation trail for a single company. Separate from CRM customer audit (`crm_audit`).

```text
Domain mutation
  → Repository / Service (+ EventBus)
  → AuditEngine (or AuditService.record)
  → ops_audit local + Firestore
  → Utilities → Audit log
```

## What is traced

| Kind | Source |
|------|--------|
| Login / logout / failed login | `AuthProvider` |
| Product create / update | `PRODUCT_*` |
| Selling price change | `PRICE_CHANGED` |
| Stock adjustments | `INVENTORY_MOVEMENT_CREATED` (adjust / damage / wastage / opening) |
| Refunds | `REFUND_CREATED` |
| Discounts on sale | `INVOICE_CREATED` when discount &gt; 0 |
| Promotions / coupons | `PROMOTION_*` / `COUPON_*` |
| Banking opening / adjustments | `BankingService` |
| Expenses | `EXPENSE_CREATED` |
| Staff created | `StaffService.create` |
| Store settings | `StoreSettingsRepository.save` |

Especially answerable:

- Who changed the selling price?
- Who adjusted stock?
- Who gave a large discount?
- Who refunded the transaction?

## Architecture

| Layer | Path |
|-------|------|
| UI | `/utilities/audit` — `AuditLogPage` |
| Service | `src/modules/audit/AuditService.ts` |
| Engine | `src/modules/audit/AuditEngine.ts` (bootstrap) |
| Repository | `src/repositories/OpsAuditRepository.ts` |
| Local | `src/data/opsAudit.ts` → `retailos.ops_audit.v1` |
| Firestore | `ops_audit` |

Do not litter React screens — prefer EventBus → AuditEngine. Direct `AuditService.record` only where no domain event exists (auth, banking, staff, settings).

## Access

Admin + manager via Utilities → **Audit log**.
