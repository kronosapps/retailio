/**
 * POS operational prefs (business settings — not env).
 * Lane count remains code-fixed (3) until a multi-lane store model ships.
 */

const STORAGE_KEY = "retailos.pos.settings.v1"

export type PosSettings = {
  /** When true, charge prompts if business day is closed. */
  requireDayOpen: boolean
  /** Soft note shown in Settings — lanes are session tabs, not DB entities. */
  laneCountNote: string
}

const DEFAULTS: PosSettings = {
  requireDayOpen: true,
  laneCountNote: "3 POS session tabs (fixed in app for now).",
}

function sanitize(raw: Partial<PosSettings>): PosSettings {
  return {
    requireDayOpen:
      typeof raw.requireDayOpen === "boolean"
        ? raw.requireDayOpen
        : DEFAULTS.requireDayOpen,
    laneCountNote: DEFAULTS.laneCountNote,
  }
}

export function getPosSettings(): PosSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return sanitize(JSON.parse(raw) as Partial<PosSettings>)
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePosSettings(patch: Partial<PosSettings>): PosSettings {
  const next = sanitize({ ...getPosSettings(), ...patch })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
