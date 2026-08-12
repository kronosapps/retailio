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

type UpdateStaffRequest = {
  id?: string
  username?: string
  passcode?: string
  displayName?: string
  role?: string
  active?: boolean
}

/**
 * Admin-only: update Auth + users/{uid} (username, passcode, name, role, status).
 */
export const updateStaff = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.")
  }

  await assertCallerIsAdmin(request.auth.uid)

  const body = (request.data ?? {}) as UpdateStaffRequest
  const id = String(body.id ?? "").trim()
  if (!id) {
    throw new HttpsError("invalid-argument", "Staff id is required.")
  }
  if (id === request.auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot edit your own staff account here."
    )
  }

  const ref = admin.firestore().collection("users").doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError("not-found", "Staff member not found.")
  }
  const current = snap.data() ?? {}

  const nextUsername =
    body.username !== undefined
      ? normalizeUsername(String(body.username))
      : normalizeUsername(String(current.username ?? ""))
  const nextDisplayName =
    body.displayName !== undefined
      ? String(body.displayName).trim()
      : String(current.displayName ?? nextUsername).trim()
  const nextRole =
    body.role !== undefined
      ? String(body.role).trim()
      : String(current.role ?? "cashier")
  const nextActive =
    body.active !== undefined ? Boolean(body.active) : current.active !== false

  if (!isValidUsername(nextUsername)) {
    throw new HttpsError(
      "invalid-argument",
      "Username must be 2–32 characters: lowercase letters, numbers, underscore."
    )
  }
  if (!nextDisplayName) {
    throw new HttpsError("invalid-argument", "Display name is required.")
  }
  if (!ROLES.has(nextRole)) {
    throw new HttpsError(
      "invalid-argument",
      "Role must be admin, manager, or cashier."
    )
  }

  const passcodeProvided =
    typeof body.passcode === "string" && body.passcode.length > 0
  const nextPasscode = passcodeProvided
    ? normalizePasscode(String(body.passcode))
    : null
  if (passcodeProvided && (nextPasscode?.length ?? 0) < MIN_PASSCODE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
    )
  }

  const email = usernameToAuthEmail(nextUsername)
  const prevUsername = normalizeUsername(String(current.username ?? ""))
  if (nextUsername !== prevUsername) {
    const clash = await admin
      .firestore()
      .collection("users")
      .where("username", "==", nextUsername)
      .limit(1)
      .get()
    if (!clash.empty && clash.docs[0].id !== id) {
      throw new HttpsError("already-exists", "That username is already taken.")
    }
  }

  const authUpdate: admin.auth.UpdateRequest = {
    displayName: nextDisplayName,
    disabled: !nextActive,
  }
  if (nextUsername !== prevUsername || email !== current.email) {
    authUpdate.email = email
    authUpdate.emailVerified = true
  }
  if (nextPasscode) {
    authUpdate.password = nextPasscode
  }

  try {
    await admin.auth().updateUser(id, authUpdate)
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : ""
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "That username is already taken.")
    }
    if (code === "auth/user-not-found") {
      throw new HttpsError("not-found", "Auth user not found for this staff.")
    }
    throw new HttpsError("internal", "Could not update Auth user.")
  }

  const now = new Date().toISOString()
  await ref.set(
    {
      id,
      email,
      username: nextUsername,
      displayName: nextDisplayName,
      role: nextRole,
      active: nextActive,
      updatedAt: now,
      updatedBy: request.auth.uid,
    },
    { merge: true }
  )

  return {
    id,
    username: nextUsername,
    email,
    role: nextRole,
    active: nextActive,
  }
})
