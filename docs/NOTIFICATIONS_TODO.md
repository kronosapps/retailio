# Notifications & Alerts — follow-ups (parked)

Staff soft alerts are live via `AlertService` + `SoftAlertsBell`. Optional next steps:

- [ ] Admin UI to edit `alertThresholds` (Options)
- [ ] Push / Telegram channel for critical alerts (night phone)
- [ ] Per-role alert mute (cashier vs admin)
- [ ] Digest mode (batch low-stock into one daily card)
- [ ] Deep-link to specific SKU / PO / invoice from alert meta
- [ ] Multi-device unread sync polish (Firestore `readAt` listeners)

Do not rebuild a parallel AlertService collection — extend NotificationEngine.
