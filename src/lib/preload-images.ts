const MENU_CACHE_NAME = "retailos-menu-images-v1"

export type PreloadProgress = {
  loaded: number
  total: number
  ratio: number
}

function loadImageElement(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = "async"
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

async function putInCache(url: string): Promise<void> {
  if (!("caches" in window)) return
  try {
    const cache = await caches.open(MENU_CACHE_NAME)
    const existing = await cache.match(url)
    if (existing) return
    const response = await fetch(url, { cache: "force-cache" })
    if (response.ok) {
      await cache.put(url, response.clone())
    }
  } catch {
    // Ignore cache failures; Image preload still warms browser cache.
  }
}

export async function preloadImages(
  urls: string[],
  onProgress?: (progress: PreloadProgress) => void
): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))]
  const total = unique.length

  if (total === 0) {
    onProgress?.({ loaded: 0, total: 0, ratio: 1 })
    return
  }

  let loaded = 0
  const report = () => {
    onProgress?.({
      loaded,
      total,
      ratio: loaded / total,
    })
  }

  report()

  await Promise.all(
    unique.map(async (url) => {
      await Promise.all([putInCache(url), loadImageElement(url)])
      loaded += 1
      report()
    })
  )
}
