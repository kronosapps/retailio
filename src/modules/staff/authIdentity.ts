/** Synthetic Auth email domain for username/passcode login. */
export const RETAILOS_AUTH_DOMAIN = "retailos.local"

const USERNAME_RE = /^[a-z0-9_]{2,32}$/

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function normalizePasscode(raw: string): string {
  return raw.trim()
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(normalizeUsername(username))
}

/** Map POS username → Firebase Auth email (`{username}@retailos.local`). */
export function usernameToAuthEmail(username: string): string {
  const normalized = normalizeUsername(username)
  return `${normalized}@${RETAILOS_AUTH_DOMAIN}`
}

export function usernameFromAuthEmail(email: string): string {
  const local = email.split("@")[0]?.trim().toLowerCase() ?? ""
  return local || email.trim().toLowerCase()
}

export const MIN_PASSCODE_LENGTH = 4
