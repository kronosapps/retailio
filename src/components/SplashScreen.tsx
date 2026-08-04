import { assetUrl } from "@/lib/asset-url"

type SplashScreenProps = {
  progress: number
  title?: string
  subtitle?: string
  imageSrc?: string
}

export function SplashScreen({
  progress,
  title = "RetailOS",
  subtitle = "Preparing menu images…",
  imageSrc = assetUrl("/menu/bellam-halwa-main.png"),
}: SplashScreenProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-6 size-28 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:size-32">
          <img
            src={imageSrc}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          {percent}%
        </p>
      </div>
    </div>
  )
}
