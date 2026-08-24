import type { LucideIcon } from "lucide-react"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { KpiTrend } from "../../types/dashboard"
import { formatChange, formatKpiValue } from "../format"
import {
  DASHBOARD_ACCENT,
  type DashboardAccent,
} from "../palette"

export function KpiCard({
  title,
  kpi,
  hint,
  accent = "slate",
  icon: AccentIcon,
}: {
  title: string
  kpi: KpiTrend
  hint?: string
  accent?: DashboardAccent
  icon?: LucideIcon
}) {
  const tone = DASHBOARD_ACCENT[accent]
  const TrendIcon =
    kpi.direction === "up"
      ? ArrowUpRight
      : kpi.direction === "down"
        ? ArrowDownRight
        : ArrowRight

  return (
    <Card
      size="sm"
      className={cn("min-w-0 overflow-hidden border shadow-none", tone.card)}
    >
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className={cn("font-medium", tone.label)}>
            {title}
          </CardDescription>
          {AccentIcon ? (
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                tone.iconWrap
              )}
            >
              <AccentIcon className="size-4" aria-hidden />
            </span>
          ) : null}
        </div>
        <CardTitle
          className={cn(
            "text-xl tabular-nums tracking-tight sm:text-2xl",
            tone.value
          )}
        >
          {formatKpiValue(kpi)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            kpi.direction === "up" && "text-emerald-600 dark:text-emerald-400",
            kpi.direction === "down" && "text-rose-600 dark:text-rose-400",
            kpi.direction === "flat" && "text-muted-foreground"
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden />
          <span>{formatChange(kpi)}</span>
          <span className="font-normal text-muted-foreground">
            vs prior period
          </span>
        </div>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function KpiCardSkeleton() {
  return (
    <Card size="sm" className="min-w-0 animate-pulse border-border/60">
      <CardHeader>
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="mt-2 h-7 w-28 rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-3 w-24 rounded bg-muted" />
      </CardContent>
    </Card>
  )
}
