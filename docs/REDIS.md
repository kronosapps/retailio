# POS Redis cache (Upstash + Cloudflare Worker)

RetailOS on **Firebase Spark** has no Cloud Functions budget for a server-side cache layer. Path A uses:

- **Upstash Redis** — shared read-through cache for catalog, stock, and customer phone lookups
- **Cloudflare Worker** — authenticated HTTP API in front of Upstash (Firebase ID token verification)
- **Browser client** — `src/modules/cache/` warms/invalidates after local writes; POS hydrates on load

Local storage remains the source of truth offline. Redis keeps multiple POS terminals in sync when online and signed in.

## Architecture

```
Terminal A (browser)                    Terminal B (browser)
       │                                       │
       │  POST /v1/cache/warm                  │  GET /v1/catalog
       ▼                                       ▼
              Cloudflare Worker (pos-cache)
                         │
                         ▼
                   Upstash Redis
```

| Key | TTL | Contents |
|-----|-----|----------|
| `pos:{storeId}:products:v1` | 10 min | Full product catalog JSON |
| `pos:{storeId}:inventory:map:v1` | 2 min | `{ sku: quantity }` map |
| `pos:{storeId}:customer:phone:{phone}:v1` | 5 min | Single customer record |

Invalidation is **client-triggered** after repository writes (no Firestore triggers on Spark).

## Setup

### 1. Upstash Redis

1. Create a database at [upstash.com](https://upstash.com) (region **ap-south-1** recommended for India).
2. Copy **REST URL** and **REST TOKEN** from the database dashboard.

### 2. Deploy Cloudflare Worker

```bash
cd workers/pos-cache
npm install
npx wrangler login
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler secret put FIREBASE_API_KEY    # same as VITE_FIREBASE_API_KEY
# Optional extra gate:
npx wrangler secret put CACHE_API_KEY
npm run deploy
```

Note the deployed worker URL (e.g. `https://retailos-pos-cache.<account>.workers.dev`).

### 3. Frontend env

Add to `.env`:

```env
VITE_POS_REDIS_CACHE_ENABLED=true
VITE_POS_CACHE_WORKER_URL=https://retailos-pos-cache.<account>.workers.dev
VITE_POS_CACHE_API_KEY=          # optional; must match worker CACHE_API_KEY if set
```

Cache is active only when:

- `VITE_POS_REDIS_CACHE_ENABLED=true`
- Worker URL is set
- Firebase is configured and the user is signed in

Local-auth mode (no Firebase) skips Redis entirely.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/catalog?storeId=` | Product catalog |
| GET | `/v1/stock?storeId=&skus=` | Stock map (optional SKU filter) |
| GET | `/v1/customer?storeId=&phone=` | Customer by phone |
| POST | `/v1/cache/warm` | Push snapshot after local write |
| POST | `/v1/cache/invalidate` | Clear domain (re-warm follows client-side) |

All routes require `Authorization: Bearer <Firebase ID token>`. Optional header: `X-Cache-Api-Key`.

## App integration

| Layer | Role |
|-------|------|
| `PosCacheClient` | HTTP client; never throws |
| `posCacheSync` | Warm/invalidate helpers; merge into localStorage |
| Repositories | Invalidate + re-warm on product/inventory/customer writes |
| `ProductService.hydrateCatalogFromCache` | POS catalog refresh |
| `InventoryService.hydrateStockFromCache` | POS stock refresh |
| `CustomerService.findByPhoneFast` | Redis → local merge → lookup |
| `bootstrap.ts` | Warm all + hydrate after catalog seed |
| `PosPage` | Hydrate before building POS catalog |

## Deploy script

From repo root:

```bash
npm run worker:deploy
```

## Testing two terminals

1. Sign in on Terminal A and B with Firebase Auth (same store).
2. On A: add or edit a product → save.
3. On B: open POS (or refresh) → catalog should include A's change within TTL or immediately after invalidate/warm.
4. Repeat for stock adjustments and customer phone lookup at checkout.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Cache never used | `VITE_POS_REDIS_CACHE_ENABLED`, worker URL, Firebase sign-in |
| 401 from worker | Firebase API key secret on worker; valid ID token |
| Stale data | TTL windows; confirm repository hooks fire (network tab → warm POST) |
| CORS errors | Worker sends `Access-Control-Allow-Origin: *` on all routes |
