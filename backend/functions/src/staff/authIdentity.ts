export const RETAILOS_AUTH_DOMAIN = "retailos.local"
export const MIN_PASSCODE_LENGTH = 4
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

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${RETAILOS_AUTH_DOMAIN}`
}
