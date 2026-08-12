import * as admin from "firebase-admin"
import { HttpsError, onCall } from "firebase-functions/v2/https"

import { assertCallerIsAdmin } from "./assertAdmin"

type DeleteStaffRequest = {
  id?: string
  /** When true, delete Auth + Firestore. Default: soft-delete (inactive). */
  hard?: boolean
}

/**
 * Admin-only: soft-delete staff (inactive + Auth disabled) or hard-delete.
 */
export const deleteStaff = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.")
  }

  await assertCallerIsAdmin(request.auth.uid)

  const body = (request.data ?? {}) as DeleteStaffRequest
  const id = String(body.id ?? "").trim()
  if (!id) {
    throw new HttpsError("invalid-argument", "Staff id is required.")
  }
  if (id === request.auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot delete your own staff account."
    )
  }

  const ref = admin.firestore().collection("users").doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError("not-found", "Staff member not found.")
  }

  const hard = Boolean(body.hard)
  const now = new Date().toISOString()

  if (hard) {
    await admin.auth().deleteUser(id).catch(() => undefined)
    await ref.delete()
    return { id, deleted: true, hard: true }
  }

  await admin.auth().updateUser(id, { disabled: true }).catch(() => undefined)
  await ref.set(
    {
      active: false,
      updatedAt: now,
      updatedBy: request.auth.uid,
    },
    { merge: true }
  )

  return { id, deleted: true, hard: false, active: false }
})
