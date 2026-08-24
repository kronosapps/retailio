import {
  Banknote,
  PackageMinus,
  ShoppingBag,
  Users,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { TodaySnapshot as Snapshot } from "../types/dashboard"
import { DASHBOARD_ACCENT } from "./palette"

export function TodaySnapshotPanel({ snapshot }: { snapshot: Snapshot }) {
  const rows = [
    {
      label: "Revenue",
      value: formatMoney(snapshot.revenuePaisa),
      accent: "teal" as const,
      icon: Banknote,
    },
    {
      label: "Orders",
      value: String(snapshot.orders),
      accent: "sky" as const,
      icon: ShoppingBag,
    },
    {
      label: "Customers",
      value: String(snapshot.customers),
      accent: "violet" as const,
      icon: Users,
    },
    {
      label: "Best seller",
      value: snapshot.bestSellerName || "—",
      accent: "emerald" as const,
      icon: ShoppingBag,
    },
    {
      label: "Low stock",
      value: String(snapshot.lowStockCount),
      accent: "amber" as const,
      icon: PackageMinus,
    },
    {
      label: "UPI sales",
      value: `${snapshot.upiSharePercent.toFixed(0)}%`,
      accent: "cyan" as const,
      icon: Banknote,
    },
  ]

  return (
    <Card
      size="sm"
      className="h-full min-w-[260px] overflow-hidden border-teal-200/70 bg-gradient-to-br from-teal-50 via-white to-sky-50 shadow-none lg:max-w-sm dark:border-teal-800/50 dark:from-teal-950/50 dark:via-card dark:to-sky-950/30"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide text-teal-900 uppercase dark:text-teal-100">
          Today&apos;s snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const tone = DASHBOARD_ACCENT[row.accent]
          const Icon = row.icon
          return (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
                    tone.iconWrap
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                {row.label}
              </span>
              <span
                className={cn(
                  "max-w-[55%] truncate text-right font-semibold tabular-nums",
                  tone.value
                )}
              >
                {row.value}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
