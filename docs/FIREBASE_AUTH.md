# Firebase Auth setup (RetailOS)

When `VITE_FIREBASE_*` is configured, login uses **Firebase Authentication**.  
Local `.env` passwords are only used if Firebase is not configured.

## 1. Enable Email/Password

Firebase Console → **Authentication** → **Sign-in method** → enable **Email/Password**.

## 2. Create a staff user

Authentication → **Users** → **Add user**

Example:

- Email: `admin@yourstore.com`
- Password: (strong password)

Copy the user’s **UID**.

## 3. Create the Firestore profile

Firestore → collection `users` → document ID = **that UID**:

```json
{
  "email": "admin@yourstore.com",
  "displayName": "Store Admin",
  "role": "admin",
  "storeId": "store-1",
  "active": true
}
```

Cashier example (`role`: `"cashier"`):

```json
{
  "email": "cashier@yourstore.com",
  "displayName": "Front Cashier",
  "role": "cashier",
  "storeId": "store-1",
  "active": true
}
```

`role` must be exactly `admin` or `cashier`.

## 4. Deploy rules

```bash
firebase deploy --only firestore:rules
```

Authenticated users can read their own `users/{uid}` and read/write app data (dev rules).

## 5. Sign in

Open the app → login with the Firebase email/password.

On success:

- Firebase Auth session is active (`request.auth != null`)
- Charge/invoice writes to Firestore can succeed
- Profile (role, storeId) comes from `users/{uid}`

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Invalid email or password | User missing in Authentication, or wrong password |
| No store profile found… | Missing/invalid `users/{uid}` document |
| permission-denied | Deploy rules; confirm you’re signed in |
| Falls back to local users | Firebase env incomplete — check `.env` |
