import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

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

export function KpiCard({
  title,
  kpi,
  hint,
}: {
  title: string
  kpi: KpiTrend
  hint?: string
}) {
  const Icon =
    kpi.direction === "up"
      ? ArrowUpRight
      : kpi.direction === "down"
        ? ArrowDownRight
        : ArrowRight

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader className="pb-0">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums tracking-tight sm:text-2xl">
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
          <Icon className="size-3.5" aria-hidden />
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
    <Card size="sm" className="min-w-0 animate-pulse">
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
