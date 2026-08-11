import * as admin from "firebase-admin"
import { HttpsError, onCall } from "firebase-functions/v2/https"

import { assertCallerIsAdmin } from "./assertAdmin"
import { usernameFromEmailFallback } from "./usernameFromEmail"

/**
 * Admin-only: list staff profiles from Firestore users.
 */
export const listStaff = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.")
  }

  await assertCallerIsAdmin(request.auth.uid)

  const snap = await admin.firestore().collection("users").get()
  const staff = snap.docs.map((doc) => {
    const data = doc.data()
    const email = typeof data.email === "string" ? data.email : ""
    const username =
      typeof data.username === "string" && data.username
        ? data.username
        : usernameFromEmailFallback(email)
    return {
      id: doc.id,
      username,
      email,
      displayName:
        typeof data.displayName === "string" ? data.displayName : username,
      role: (data.role as string) || "cashier",
      storeId: typeof data.storeId === "string" ? data.storeId : "store-1",
      active: data.active !== false,
      createdAt:
        typeof data.createdAt === "string"
          ? data.createdAt
          : data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    }
  })

  staff.sort((a, b) => a.username.localeCompare(b.username))
  return { staff }
})
