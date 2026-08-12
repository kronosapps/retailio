# Settings / Configuration Center

Admin hub for **business configuration**. Deploy-time secrets and infra stay in environment config.

```text
Settings
├── Business          → Business Setup (store settings doc)
├── Invoice           → prefix / receipt footer
├── Tax               → GST runtime settings
├── Inventory         → default reorder level
├── POS               → day-open gate
├── Payments          → merchant UPI / timeouts
├── Banking           → /banking (ledger; account display from env)
├── Notifications     → staff alert thresholds
├── Users & Roles     → /staff
├── Integrations      → env status + Sheets day sync
└── Data / Backup     → /utilities/backup
```

## Two layers (do not mix)

| Layer | Where | Examples |
|-------|--------|----------|
| **Environment** | `src/core/config/env.ts` ← `.env` | Firebase keys, `VITE_GOOGLE_SCRIPT_URL`, WhatsApp webhook, banking seed display, local-auth seeds |
| **Business settings** | Firestore `settings` / local stores | Store identity, GST mode, payment merchant UPI, alert thresholds, inventory defaults, POS prefs |

Integrations UI shows env **status** (configured / missing) but does not write secrets.

## Routes

| Path | Role |
|------|------|
| `/settings` | admin |
| `/settings/invoice` … `/settings/integrations` | admin |
| `/options` | redirects → `/settings` |

Nav label: **Settings** (replaces Admin Options).

## Module

| Path | Role |
|------|------|
| `src/modules/settings/catalog.ts` | Section IA + RBAC |
| `src/modules/settings/SettingsService.ts` | Facade |
| `src/modules/settings/inventorySettings.ts` | `retailos.inventory.settings.v1` |
| `src/modules/settings/posSettings.ts` | `retailos.pos.settings.v1` |
| `src/pages/settings/*` | UI |

## Related stores

| Key | Domain |
|-----|--------|
| `retailos.store.settings.v1` | Business / invoice branding |
| `retailos.gst_settings.v1` | Tax |
| `retailos.payment.settings.v1` | Payments |
| `retailos.alert_thresholds.v1` | Notifications |
| `retailos.inventory.settings.v1` | Inventory defaults |
| `retailos.pos.settings.v1` | POS prefs |

Utilities remain tools/reports — not a second settings dump.
