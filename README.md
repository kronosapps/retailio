# RetailOS

Point-of-sale and store ops app (Vite + React + TypeScript + Firebase).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local Vite server |
| `npm run build` | Typecheck + production build |
| `npm run deploy` | Build and publish to GitHub Pages |
| `npm run db:wipe` | Wipe Firestore app data (keeps `users`) |
| `npm run db:wipe:force` | Same wipe, no confirmation prompt |

---

## Wipe Firestore (start fresh)

Use this when you want a clean Firestore database **without** deleting staff login profiles in `users`.

### Prerequisites

1. [Firebase CLI](https://firebase.google.com/docs/cli) installed  
   `npm i -g firebase-tools`
2. Logged in and on the RetailOS project:

```bash
firebase login
firebase use retailio-7586e
```


### Deploy Functions

Your functions codebase is named retailos in firebase.json, so bare --only functions:createStaff does not match anything.

Use:

`firebase deploy --only functions:retailos:createStaff,functions:retailos:listStaff`
Or deploy the whole codebase:

`firebase deploy --only functions:retailos`
### Run the wipe

From the repo root:

```bash
npm run db:wipe
```

When prompted, type `wipe` and press Enter.

Skip the prompt (CI / scripting):

```bash
npm run db:wipe:force
```

### What gets deleted

| Collection | Deleted? |
|------------|----------|
| `products` | Yes |
| `customers` | Yes |
| `suppliers` | Yes |
| `invoices` | Yes |
| `payments` | Yes |
| `inventory` | Yes |
| `expenses` | Yes |
| `settings` | Yes |
| `sync_events` | Yes |
| **`users`** | **No — kept** |

Script: [`scripts/wipe-firestore.mjs`](scripts/wipe-firestore.mjs)

### After wiping

1. **Browser local data** — DevTools → Application → Local Storage → remove keys starting with `retailos.`  
   (Otherwise the app may keep old invoices / inventory / product seed flags offline.)
2. **Hard-refresh** the app — the product catalog reseeds from `src/data/products.json` into local + Firestore.
3. **Google Sheets** — not cleared by this command; empty the sheet tabs manually if needed.

### Safety notes

- This only affects the Firebase project selected by `firebase use`.
- It does **not** delete Firebase Auth accounts; only Firestore docs outside `users`.
- Prefer `npm run db:wipe` (with confirmation) for manual use; reserve `--force` for automation.

More Firebase architecture notes: [`docs/FIREBASE.md`](docs/FIREBASE.md).

Company WhatsApp receipts (business number via webhook): [`docs/WHATSAPP_RECEIPTS.md`](docs/WHATSAPP_RECEIPTS.md).
