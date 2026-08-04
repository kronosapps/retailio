# Firebase Foundation

Centralized Firebase access for RetailOS. React components never initialize Firebase and never import config/env keys directly.

## Architecture

```text
React / Modules
      ↓
Repositories (extend BaseRepository)
      ↓
@/core/firebase  (infrastructure entrypoint)
      ↓
Firebase App · Firestore · Auth
```

## Folder purpose

| Path | Purpose |
|------|---------|
| `src/core/config/env.ts` | Central `import.meta.env` access |
| `src/core/firebase/firebase.ts` | Init once, export app/db/auth |
| `src/core/firebase/firestore.ts` | Generic CRUD / query / transaction / batch |
| `src/core/firebase/auth.ts` | Auth instance + login / logout / currentUser |
| `src/core/firebase/collections.ts` | `COLLECTIONS` constants (no magic strings) |
| `src/core/firebase/errors.ts` | Safe error mapping for UI |
| `src/core/firebase/index.ts` | Public barrel export |
| `src/types/documents.ts` | `BaseDocument`, Invoice, Payment, … |
| `src/repositories/BaseRepository.ts` | Abstract CRUD for future repos |
| `src/services/sync/` | Business sync (Sheets, etc.) — not infrastructure |
| `src/shared/` | Pure shared helpers |
| `firestore.rules` | Authenticated-only development rules |
| `firestore.indexes.json` | Index config (empty starter) |

## Why `core/` instead of `services/firebase`

Firebase is application infrastructure (like config and logging). Business services (sync, reporting) stay under `services/`. Future Storage, Cloud Messaging, Remote Config, Analytics also belong under `core/firebase/` (or sibling `core/` packages).

## Why repositories exist

- Keep Firestore details out of React and business UI
- One collection ownership per repository
- Swap local/offline adapters later without rewriting screens
- Enforce `BaseDocument` audit fields (`createdAt`, `updatedBy`, …)

## How to add a new collection

1. Add the name to `COLLECTIONS` in `collections.ts`
2. Add a TypeScript interface extending `BaseDocument` in `types/documents.ts`
3. Add a `match /your_collection/{id}` block in `firestore.rules`
4. Create `YourRepository extends BaseRepository<YourType>`
5. Set `protected readonly collectionName = COLLECTIONS.YOUR_NAME`

Collections are created automatically on the first document write — no manual console seeding required.

## Using Firestore helpers

```ts
import {
  COLLECTIONS,
  createDocument,
  getDocument,
  queryCollection,
} from "@/core/firebase"
import { where, orderBy } from "firebase/firestore"

await createDocument(COLLECTIONS.CUSTOMERS, id, data)
await getDocument(COLLECTIONS.CUSTOMERS, id)
await queryCollection(
  COLLECTIONS.INVOICES,
  where("storeId", "==", storeId),
  orderBy("createdAt", "desc")
)
```

Prefer `BaseRepository` subclasses over calling helpers from React.

## Authentication initialization

1. `core/config/env.ts` exposes Firebase env values
2. `firebase.ts` calls `initializeApp` **once** when configured
3. `auth.ts` uses that Auth instance
4. `login({ email, password })` / `logout()` / `currentUser()` are the supported API

Development logging: initialization is logged only when `env.dev` is true.

## Import rule

```ts
// ✅
import { COLLECTIONS, login, getDocument } from "@/core/firebase"
import { env } from "@/core/config/env"

// ❌
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
```

Legacy shims `@/services/firebase`, `@/lib/firebase`, and `@/firebase` re-export `@/core/firebase`.
