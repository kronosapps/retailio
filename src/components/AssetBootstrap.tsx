import { useEffect, useState, type ReactNode } from "react"

import { SplashScreen } from "@/components/SplashScreen"
import { getMenuImageUrls } from "@/data/menu"
import { assetUrl } from "@/lib/asset-url"
import { preloadImages } from "@/lib/preload-images"

const MIN_SPLASH_MS = 700

type AssetBootstrapProps = {
  children: ReactNode
}

export function AssetBootstrap({ children }: AssetBootstrapProps) {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    async function run() {
      const urls = [
        assetUrl("/menu/bellam-halwa-main.png"),
        assetUrl("/favicon.svg"),
        ...getMenuImageUrls(),
      ]

      await preloadImages(urls, ({ ratio }) => {
        if (!cancelled) setProgress(ratio)
      })

      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed)
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }

      if (!cancelled) {
        setProgress(1)
        setReady(true)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <SplashScreen
        progress={progress}
        title="RetailOS"
        subtitle="Loading and caching menu images…"
      />
    )
  }

  return children
}
