import { cn } from "@/lib/utils"

import type { PaymentStatus as Status } from "../types"
import { paymentStatusTone } from "../utils"

const toneClass: Record<ReturnType<typeof paymentStatusTone>, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-orange-100 text-orange-800 border-orange-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  danger: "bg-red-100 text-red-700 border-red-200",
  muted: "bg-stone-200 text-stone-700 border-stone-300",
}

export function PaymentStatus({
  status,
  className,
}: {
  status: Status
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        toneClass[paymentStatusTone(status)],
        className
      )}
    >
      {status}
    </span>
  )
}
