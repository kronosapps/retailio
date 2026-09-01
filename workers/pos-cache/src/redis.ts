export type Env = {
  UPSTASH_REDIS_REST_URL: string
  UPSTASH_REDIS_REST_TOKEN: string
  FIREBASE_API_KEY?: string
  CACHE_API_KEY?: string
  DEFAULT_STORE_ID?: string
}

type RedisCommand = (string | number)[]

async function redisCommand(env: Env, command: RedisCommand): Promise<unknown> {
  const url = `${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upstash error ${res.status}: ${text}`)
  }
  const body = (await res.json()) as { result?: unknown }
  return body.result
}

export async function redisGet(env: Env, key: string): Promise<string | null> {
  const result = await redisCommand(env, ["GET", key])
  return typeof result === "string" ? result : null
}

export async function redisSet(
  env: Env,
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  await redisCommand(env, ["SET", key, value, "EX", ttlSeconds])
}

export async function redisDel(env: Env, key: string): Promise<void> {
  await redisCommand(env, ["DEL", key])
}

/** Delete keys matching prefix (Upstash SCAN + DEL). */
export async function redisDelByPrefix(
  env: Env,
  prefix: string
): Promise<number> {
  let cursor = 0
  let deleted = 0
  do {
    const scanResult = (await redisCommand(env, [
      "SCAN",
      cursor,
      "MATCH",
      `${prefix}*`,
      "COUNT",
      100,
    ])) as [string, string[]] | null
    if (!scanResult) break
    cursor = Number(scanResult[0])
    const keys = scanResult[1] ?? []
    for (const key of keys) {
      await redisDel(env, key)
      deleted += 1
    }
  } while (cursor !== 0)
  return deleted
}
