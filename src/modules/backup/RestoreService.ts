import { BACKUP_FORMAT_VERSION } from "./types"

export type RestoreInspection = {
  ok: boolean
  formatVersion: number | null
  kind: string | null
  exportedAt: string | null
  storeId: string | null
  collectionKeys: string[]
  error: string | null
  /** Always false until restore writer ships. */
  canApply: false
}

/**
 * Restore is admin-only and intentionally non-writing for now.
 * Validates / inspects a backup file without mutating local or cloud data.
 */
export class RestoreService {
  static inspectJsonText(raw: string): RestoreInspection {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const manifest =
        parsed.manifest && typeof parsed.manifest === "object"
          ? (parsed.manifest as Record<string, unknown>)
          : parsed
      const formatVersion =
        typeof manifest.formatVersion === "number"
          ? manifest.formatVersion
          : typeof parsed.formatVersion === "number"
            ? parsed.formatVersion
            : null
      const collections =
        parsed.collections && typeof parsed.collections === "object"
          ? (parsed.collections as Record<string, unknown>)
          : null
      const collectionKeys = collections
        ? Object.keys(collections)
        : Object.keys(parsed).filter(
            (k) =>
              k !== "manifest" &&
              k !== "meta" &&
              k !== "formatVersion" &&
              k !== "kind" &&
              k !== "exportedAt" &&
              k !== "storeId"
          )

      if (formatVersion != null && formatVersion > BACKUP_FORMAT_VERSION) {
        return {
          ok: false,
          formatVersion,
          kind: String(manifest.kind ?? parsed.kind ?? ""),
          exportedAt: String(manifest.exportedAt ?? parsed.exportedAt ?? ""),
          storeId:
            (manifest.storeId as string | null) ??
            (parsed.storeId as string | null) ??
            null,
          collectionKeys,
          error: `Backup format v${formatVersion} is newer than this app (v${BACKUP_FORMAT_VERSION}).`,
          canApply: false,
        }
      }

      return {
        ok: true,
        formatVersion,
        kind: (manifest.kind as string) || (parsed.kind as string) || null,
        exportedAt:
          (manifest.exportedAt as string) ||
          (parsed.exportedAt as string) ||
          null,
        storeId:
          (manifest.storeId as string | null) ??
          (parsed.storeId as string | null) ??
          null,
        collectionKeys,
        error: null,
        canApply: false,
      }
    } catch (err) {
      return {
        ok: false,
        formatVersion: null,
        kind: null,
        exportedAt: null,
        storeId: null,
        collectionKeys: [],
        error: err instanceof Error ? err.message : "Invalid JSON backup.",
        canApply: false,
      }
    }
  }

  /**
   * Hard refuse apply — restore writer not enabled.
   */
  static async apply(_payload: unknown): Promise<never> {
    throw new Error(
      "Restore is disabled. Export backups for safekeeping; restore will ship behind admin-only controls."
    )
  }
}
