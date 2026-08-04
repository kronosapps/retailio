# Firebase Foundation

Centralized Firebase access for RetailOS. React components never initialize Firebase and never import config/env keys directly.

## Architecture

```text
React / Modules
      ↓
Repositories (extend BaseRepository)
      ↓
@/services/firebase  (ONLY entrypoint)
      ↓
Firebase App · Firestore · Auth
```

## Folder purpose

| Path | Purpose |
|------|---------|
| `src/services/firebase/firebase.ts` | Read `import.meta.env`, init once, export app/db/auth |
| `src/services/firebase/firestore.ts` | Generic CRUD / query / transaction / batch helpers |
| `src/services/firebase/auth.ts` | Auth instance + login / logout / currentUser |
| `src/services/firebase/collections.ts` | `COLLECTIONS` constants (no magic strings) |
| `src/services/firebase/errors.ts` | Safe error mapping for UI |
| `src/services/firebase/index.ts` | Public barrel export |
| `src/types/documents.ts` | `BaseDocument`, Invoice, Payment, … |
| `src/repositories/BaseRepository.ts` | Abstract CRUD for future repos |
| `firestore.rules` | Authenticated-only development rules |
| `firestore.indexes.json` | Index config (empty starter) |

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
} from "@/services/firebase"
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

1. `firebase.ts` reads `VITE_FIREBASE_*` and calls `initializeApp` **once** when configured
2. `auth.ts` uses that Auth instance
3. `login({ email, password })` / `logout()` / `currentUser()` are the supported API
4. Google / phone providers can be added inside `auth.ts` later (`AuthProviders` markers)

Development logging: initialization is logged only when `import.meta.env.DEV` is true.

## Environment variables

Required:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_APP_ID`

Optional: `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_MEASUREMENT_ID`

If required vars are missing, soft exports (`db`, `auth`) stay `null` so local POS can run; calling strict helpers / `initializeFirebase()` throws `AppFirebaseError` with a clear message.

## Security rules

`firestore.rules` allows **authenticated** read/write only in development.  
Comments mark where production role/store scoping will be added.  
Never deploy `allow read, write: if true`.

## Import rule

```ts
// ✅
import { COLLECTIONS, login, getDocument } from "@/services/firebase"

// ❌
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"
```

Legacy re-exports `@/lib/firebase` and `@/firebase` remain for existing code and forward to this service.
