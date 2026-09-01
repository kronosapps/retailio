import { assertStoreId, authorizeRequest } from "./auth"
import {
  customerPhoneKey,
  inventoryMapKey,
  productsKey,
  TTL,
  type CacheDomain,
} from "./keys"
import { redisDel, redisDelByPrefix, redisGet, redisSet, type Env } from "./redis"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Cache-Api-Key",
  "Access-Control-Max-Age": "86400",
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  })
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, "") || "/"

    try {
      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "retailos-pos-cache" })
      }

      const auth = await authorizeRequest(request, env)
      if (!auth.ok) {
        return json({ error: auth.message }, auth.status)
      }

      if (path === "/v1/catalog" && request.method === "GET") {
        return handleGetCatalog(url, env)
      }
      if (path === "/v1/stock" && request.method === "GET") {
        return handleGetStock(url, env)
      }
      if (path === "/v1/customer" && request.method === "GET") {
        return handleGetCustomer(url, env)
      }
      if (path === "/v1/cache/warm" && request.method === "POST") {
        return handleWarm(request, env)
      }
      if (path === "/v1/cache/invalidate" && request.method === "POST") {
        return handleInvalidate(request, env)
      }

      return json({ error: "Not found" }, 404)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Internal server error"
      return json({ error: message }, 500)
    }
  },
}

async function handleGetCatalog(url: URL, env: Env): Promise<Response> {
  const storeId = assertStoreId(url.searchParams.get("storeId"), env)!
  const key = productsKey(storeId)
  const raw = await redisGet(env, key)
  if (!raw) {
    return json({ storeId, products: null, source: "miss" })
  }
  const products = JSON.parse(raw) as unknown
  return json({
    storeId,
    products,
    source: "redis",
    cachedAt: new Date().toISOString(),
  })
}

async function handleGetStock(url: URL, env: Env): Promise<Response> {
  const storeId = assertStoreId(url.searchParams.get("storeId"), env)!
  const key = inventoryMapKey(storeId)
  const raw = await redisGet(env, key)
  if (!raw) {
    return json({ storeId, stock: null, source: "miss" })
  }
  const stock = JSON.parse(raw) as Record<string, number>
  const skusParam = url.searchParams.get("skus")
  if (skusParam) {
    const wanted = skusParam.split(",").map((s) => s.trim()).filter(Boolean)
    const filtered: Record<string, number> = {}
    for (const sku of wanted) {
      if (sku in stock) filtered[sku] = stock[sku]!
    }
    return json({ storeId, stock: filtered, source: "redis" })
  }
  return json({ storeId, stock, source: "redis" })
}

async function handleGetCustomer(url: URL, env: Env): Promise<Response> {
  const storeId = assertStoreId(url.searchParams.get("storeId"), env)!
  const phone = normalizePhone(url.searchParams.get("phone") ?? "")
  if (!phone) {
    return json({ error: "phone query param required" }, 400)
  }
  const key = customerPhoneKey(storeId, phone)
  const raw = await redisGet(env, key)
  if (!raw) {
    return json({ storeId, phone, customer: null, source: "miss" })
  }
  return json({
    storeId,
    phone,
    customer: JSON.parse(raw),
    source: "redis",
  })
}

type WarmBody = {
  storeId?: string
  domain: CacheDomain
  payload?: unknown
  phone?: string
}

async function handleWarm(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as WarmBody
  const storeId = assertStoreId(body.storeId ?? null, env)!

  switch (body.domain) {
    case "products": {
      const key = productsKey(storeId)
      await redisSet(env, key, JSON.stringify(body.payload ?? []), TTL.products)
      return json({ ok: true, domain: "products", storeId })
    }
    case "inventory": {
      const key = inventoryMapKey(storeId)
      await redisSet(env, key, JSON.stringify(body.payload ?? {}), TTL.inventory)
      return json({ ok: true, domain: "inventory", storeId })
    }
    case "customers": {
      const phone = normalizePhone(body.phone ?? "")
      if (!phone) {
        return json({ error: "phone required for customers warm" }, 400)
      }
      const key = customerPhoneKey(storeId, phone)
      await redisSet(env, key, JSON.stringify(body.payload ?? null), TTL.customer)
      return json({ ok: true, domain: "customers", storeId, phone })
    }
    default:
      return json({ error: "Invalid domain" }, 400)
  }
}

type InvalidateBody = {
  storeId?: string
  domain: CacheDomain
  phone?: string
}

async function handleInvalidate(
  request: Request,
  env: Env
): Promise<Response> {
  const body = (await request.json()) as InvalidateBody
  const storeId = assertStoreId(body.storeId ?? null, env)!

  switch (body.domain) {
    case "products":
      await redisDel(env, productsKey(storeId))
      break
    case "inventory":
      await redisDel(env, inventoryMapKey(storeId))
      break
    case "customers": {
      const phone = normalizePhone(body.phone ?? "")
      if (phone) {
        await redisDel(env, customerPhoneKey(storeId, phone))
      } else {
        await redisDelByPrefix(env, `pos:${storeId}:customer:phone:`)
      }
      break
    }
    default:
      return json({ error: "Invalid domain" }, 400)
  }

  return json({ ok: true, domain: body.domain, storeId })
}
