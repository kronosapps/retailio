# Firebase Auth setup (RetailOS)

When `VITE_FIREBASE_*` is configured (via `src/core/config/env.ts`), login uses **Firebase Authentication**.  
Local mock users are used only if Firebase is not configured.

Staff sign in with **username + passcode**. Under the hood Auth still uses email/password:

- Auth email = `{username}@retailos.local`
- Auth password = passcode

## Roles

| Role | Access |
|------|--------|
| `admin` | Full app + Staff management + Admin Options |
| `manager` | POS, dashboard, inventory, customers, transactions |
| `cashier` | POS only |

## 1. Enable Email/Password

Firebase Console → **Authentication** → **Sign-in method** → enable **Email/Password**.

## 2. Seed the first admin (one-time)

Authentication → **Users** → **Add user**

- Email: `admin@retailos.local`
- Password: `admin123` (change after first login)

Copy the user’s **UID**. Create Firestore `users/{uid}`:

```json
{
  "email": "admin@retailos.local",
  "username": "admin",
  "displayName": "Store Admin",
  "role": "admin",
  "storeId": "store-1",
  "active": true
}
```

Optional: also seed `manager@retailos.local` / `mgr123` and `cashier@retailos.local` / `cash123`, or create them from **Staff** in the app after rules are deployed.

## 3. Deploy Firestore rules (required for Staff page)

Staff create/list on the **Spark (free)** plan uses the browser:

- Secondary Firebase Auth app (admin session stays signed in)
- Admin-only read/write on `users` in Firestore rules

No Cloud Functions / Blaze plan required.

```bash
firebase deploy --only firestore:rules
```

## 4. Sign in

Open the app → username + passcode (e.g. `admin` / `admin123`).

On success:

- Firebase Auth session is active (`request.auth != null`)
- Charge/invoice writes to Firestore can succeed
- Profile (role, storeId, username) comes from `users/{uid}`

## 5. Add more staff

Sign in as admin → **Staff** → create username, passcode, display name, role.

## Local fallback (no Firebase env)

| Username | Passcode | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `manager` | `mgr123` | manager |
| `cashier` | `cash123` | cashier |

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Invalid username or password | User missing in Authentication, wrong passcode, or email not `{username}@retailos.local` |
| No store profile found… | Missing/invalid `users/{uid}` (need `role`, `storeId`, `active` not false) |
| permission-denied on Staff create/list | Deploy latest `firestore.rules`; caller must be `role: admin` |
| Falls back to local users | Firebase env incomplete — check `.env` |

## Note on Cloud Functions

`backend/functions` still contains optional `createStaff` / `listStaff` callables for a future Blaze upgrade. The app no longer depends on them.
