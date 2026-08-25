import { Package } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { InventoryAnalytics } from "../types/dashboard"
import { DASHBOARD_ACCENT } from "./palette"

export function InventoryAnalyticsPanel({
  data,
}: {
  data: InventoryAnalytics
}) {
  const { t } = useTranslation()

  const items = [
    {
      label: t("dashboard.inventoryPanel.totalProducts"),
      value: String(data.totalProducts),
      accent: "slate" as const,
    },
    {
      label: t("dashboard.inventoryPanel.inventoryValue"),
      value: formatMoney(data.inventoryValuePaisa),
      accent: "teal" as const,
    },
    {
      label: t("dashboard.inventoryPanel.lowStock"),
      value: String(data.lowStockCount),
      accent: "amber" as const,
    },
    {
      label: t("dashboard.inventoryPanel.outOfStock"),
      value: String(data.outOfStockCount),
      accent: "rose" as const,
    },
    {
      label: t("dashboard.inventoryPanel.inactiveProducts"),
      value: String(data.inactiveProducts),
      accent: "slate" as const,
    },
    {
      label: t("dashboard.inventoryPanel.damagedProducts"),
      value:
        data.damagedProducts === 0
          ? t("common.none")
          : String(data.damagedProducts),
      accent: "rose" as const,
    },
  ]

  return (
    <Card
      size="sm"
      className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-50/70 to-card shadow-none dark:border-amber-800/50 dark:from-amber-950/25"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm tracking-wide text-amber-950 uppercase dark:text-amber-100">
          <Package className="size-4" aria-hidden />
          {t("dashboard.inventoryAnalytics")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const tone = DASHBOARD_ACCENT[item.accent]
          return (
            <div
              key={item.label}
              className={cn("rounded-xl border px-3 py-2.5", tone.card)}
            >
              <p className={cn("text-xs font-medium", tone.label)}>
                {item.label}
              </p>
              <p
                className={cn(
                  "mt-1 text-sm font-semibold tabular-nums",
                  tone.value
                )}
              >
                {item.value}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
