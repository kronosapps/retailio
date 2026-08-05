import { formatMoney } from "@/lib/money"
import type { KpiTrend } from "../types/dashboard"

export function formatKpiValue(kpi: KpiTrend): string {
  if (kpi.format === "currency") return formatMoney(kpi.value)
  if (kpi.format === "percent") return `${kpi.value.toFixed(1)}%`
  return new Intl.NumberFormat("en-IN").format(Math.round(kpi.value))
}

export function formatChange(kpi: KpiTrend): string {
  if (kpi.changePercent == null) {
    return kpi.previousValue === 0 && kpi.value > 0 ? "New" : "—"
  }
  const sign = kpi.changePercent > 0 ? "+" : ""
  return `${sign}${kpi.changePercent.toFixed(1)}%`
}
