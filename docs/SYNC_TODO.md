# Sync reliability — follow-ups

- [ ] Header badge: pending + offline (use `useOnlineStatus` + SyncService counts)
- [ ] Per-entity sync watermark for EOD (skip already-upserted rows when script lags)
- [ ] Multi-device queue coordination (Firestore-backed queue for shared terminals)
- [ ] Alert deep-link → `/utilities/sync?id=`

Redeploy Apps Script upsert from [`GOOGLE_SHEETS_SYNC.md`](./GOOGLE_SHEETS_SYNC.md) after pull.
