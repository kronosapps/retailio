import * as admin from "firebase-admin"
import { HttpsError, onCall } from "firebase-functions/v2/https"

import { assertCallerIsAdmin } from "./assertAdmin"
import {
  MIN_PASSCODE_LENGTH,
  isValidUsername,
  normalizePasscode,
  normalizeUsername,
  usernameToAuthEmail,
} from "./authIdentity"

const ROLES = new Set(["admin", "manager", "cashier"])

type CreateStaffRequest = {
  username?: string
  passcode?: string
  displayName?: string
  role?: string
  storeId?: string
}

/**
 * Admin-only: create Firebase Auth user + users/{uid} profile for username login.
 */
export const createStaff = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.")
  }

  await assertCallerIsAdmin(request.auth.uid)

  const body = (request.data ?? {}) as CreateStaffRequest
  const username = normalizeUsername(String(body.username ?? ""))
  const passcode = normalizePasscode(String(body.passcode ?? ""))
  const displayName = String(body.displayName ?? "").trim()
  const role = String(body.role ?? "").trim()
  const storeId =
    typeof body.storeId === "string" && body.storeId.trim()
      ? body.storeId.trim()
      : "store-1"

  if (!isValidUsername(username)) {
    throw new HttpsError(
      "invalid-argument",
      "Username must be 2–32 characters: lowercase letters, numbers, underscore."
    )
  }
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
    )
  }
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Display name is required.")
  }
  if (!ROLES.has(role)) {
    throw new HttpsError(
      "invalid-argument",
      "Role must be admin, manager, or cashier."
    )
  }

  const email = usernameToAuthEmail(username)
  const now = new Date().toISOString()

  let userRecord: admin.auth.UserRecord
  try {
    userRecord = await admin.auth().createUser({
      email,
      password: passcode,
      displayName,
      emailVerified: true,
      disabled: false,
    })
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : ""
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "That username is already taken.")
    }
    throw new HttpsError("internal", "Could not create Auth user.")
  }

  try {
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      id: userRecord.uid,
      email,
      username,
      displayName,
      role,
      storeId,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
      updatedBy: request.auth.uid,
    })
  } catch (error) {
    await admin.auth().deleteUser(userRecord.uid).catch(() => undefined)
    throw new HttpsError("internal", "Could not write staff profile.")
  }

  return {
    id: userRecord.uid,
    username,
    email,
    role,
  }
})
