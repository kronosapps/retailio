# Notifications & Alerts — follow-ups

All parked items from the soft-alerts launch are implemented. Remaining polish is optional ops.

## Done

- [x] Admin UI to edit `alertThresholds` (Options → Staff alerts)
- [x] Push / Telegram channel for critical alerts (night phone) — queue `telegram` sibling; CF `TelegramProvider` + `TELEGRAM_BOT_TOKEN`
- [x] Per-role alert mute (cashier vs admin) — Options chips; filtered in `AlertService.listStaffAlerts`
- [x] Digest mode (batch low-stock into one daily card) — default on; out-of-stock stays per-SKU
- [x] Deep-link to specific SKU / PO / invoice from alert meta — `buildAlertHref` + query readers
- [x] Multi-device unread sync polish — Firestore `onSnapshot` for `channel == in_app`

## Optional later

- [ ] Persist thresholds to Firestore store settings (multi-device prefs)
- [ ] FCM / web push provider (channel `push` already typed)
- [ ] Per-user mute overrides (beyond role)

Do not rebuild a parallel AlertService collection — extend NotificationEngine.
