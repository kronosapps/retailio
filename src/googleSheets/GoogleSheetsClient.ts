/**
 * Low-level Apps Script / webhook client.
 * ONLY the Google Sheets sync provider may use this — never React or modules.
 *
 * POST body shape:
 * { action: "insert" | "update", sheet: string, data: object }
 */
import { env } from "@/core/config/env"

export type GoogleSheetsRequest = {
  action: "insert" | "update"
  sheet: string
  data: Record<string, unknown>
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

  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Google Sheets sync failed (${response.status}).`)
  }
}
