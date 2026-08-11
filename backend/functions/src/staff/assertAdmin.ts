import * as admin from "firebase-admin"
import { HttpsError } from "firebase-functions/v2/https"

export async function assertCallerIsAdmin(uid: string): Promise<{
  storeId: string
  role: string
}> {
  const snap = await admin.firestore().collection("users").doc(uid).get()
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "No staff profile for caller.")
  }
  const data = snap.data() ?? {}
  if (data.role !== "admin" || data.active === false) {
    throw new HttpsError("permission-denied", "Admin only.")
  }
  const storeId =
    typeof data.storeId === "string" && data.storeId ? data.storeId : "store-1"
  return { storeId, role: "admin" }
}
