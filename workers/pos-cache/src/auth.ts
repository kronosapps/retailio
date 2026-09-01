import type { Env } from "./redis"

export type AuthResult =
  | { ok: true; uid: string; via: "firebase" | "api_key" }
  | { ok: false; status: number; message: string }

export async function authorizeRequest(
  request: Request,
  env: Env
): Promise<AuthResult> {
  const apiKey = request.headers.get("X-Cache-Api-Key")
  if (env.CACHE_API_KEY && apiKey && apiKey === env.CACHE_API_KEY) {
    return { ok: true, uid: "api-key", via: "api_key" }
  }

  const authHeader = request.headers.get("Authorization") ?? ""
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const idToken = match?.[1]?.trim()
  if (!idToken) {
    return { ok: false, status: 401, message: "Missing Authorization bearer token" }
  }

  if (!env.FIREBASE_API_KEY) {
    return {
      ok: false,
      status: 503,
      message: "Worker FIREBASE_API_KEY not configured",
    }
  }

  const uid = await verifyFirebaseIdToken(idToken, env.FIREBASE_API_KEY)
  if (!uid) {
    return { ok: false, status: 401, message: "Invalid or expired Firebase token" }
  }

  return { ok: true, uid, via: "firebase" }
}

async function verifyFirebaseIdToken(
  idToken: string,
  apiKey: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      users?: Array<{ localId?: string }>
    }
    return data.users?.[0]?.localId ?? null
  } catch {
    return null
  }
}

export function assertStoreId(
  requested: string | null,
  env: Env
): string | null {
  const storeId = requested?.trim()
  if (!storeId) return env.DEFAULT_STORE_ID ?? "store-1"
  return storeId
}
