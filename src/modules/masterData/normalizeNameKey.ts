/**
 * Canonical name key for master-data uniqueness.
 * Collapses "Chocolate" / "chocolate" / "CHOCOLATE " → same key.
 */
export function normalizeNameKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

/** True when both strings collide under normalizeNameKey. */
export function namesConflict(a: string, b: string): boolean {
  const ka = normalizeNameKey(a)
  const kb = normalizeNameKey(b)
  return Boolean(ka) && ka === kb
}
