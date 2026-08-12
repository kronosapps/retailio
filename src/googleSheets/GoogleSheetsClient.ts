/**
 * Low-level Apps Script / webhook client.
 * ONLY the Google Sheets sync provider may use this — never React or modules.
 *
 * POST body shape:
 * { action: "insert" | "update" | "upsert", sheet: string, data: object, keyField?: string }
 * { action: "batchInsert" | "batchUpsert", sheet: string, rows: object[], keyField?: string }
 */
import { env } from "@/core/config/env"

export type GoogleSheetsRequest =
  | {
      action: "insert" | "update" | "upsert"
      sheet: string
      data: Record<string, unknown>
      keyField?: string
    }
  | {
      action: "batchInsert" | "batchUpsert"
      sheet: string
      rows: Record<string, unknown>[]
      keyField?: string
    }

export function getGoogleScriptUrl(): string {
  return env.googleScriptUrl
}

export async function postToGoogleSheets(
  url: string,
  body: GoogleSheetsRequest
): Promise<void> {
  const target = url.trim()
  if (!target) {
    throw new Error("Google Script URL is not configured.")
  }

  // Apps Script web apps redirect (302) and do not handle CORS preflight well.
  // Use text/plain + no-cors so the browser delivers the POST body to doPost.
  // Response is opaque (status 0) — treat send as success; verify in the Sheet.
  await fetch(target, {
    method: "POST",
    mode: "no-cors",
    cache: "no-cache",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  })
}
