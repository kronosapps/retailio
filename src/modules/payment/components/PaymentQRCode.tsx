import { cn } from "@/lib/utils"

export function PaymentQRCode({
  dataUrl,
  size = 280,
  className,
}: {
  dataUrl: string | null
  size?: number
  className?: string
}) {
  if (!dataUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground",
          className
        )}
        style={{ width: size, height: size }}
      >
        Generating QR…
      </div>
    )
  }

  return (
    <img
      src={dataUrl}
      alt="UPI payment QR code"
      width={size}
      height={size}
      className={cn(
        "rounded-xl border border-border bg-white p-2 shadow-sm",
        className
      )}
    />
  )
}
