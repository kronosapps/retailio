import { UserRound, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { CustomerAnalytics } from "../types/dashboard"
import { DASHBOARD_ACCENT } from "./palette"

export function CustomerAnalyticsPanel({
  data,
}: {
  data: CustomerAnalytics
}) {
  const { t } = useTranslation()

  const items = [
    {
      label: t("dashboard.customer.newCustomers"),
      value: String(data.newCustomers),
      accent: "emerald" as const,
    },
    {
      label: t("dashboard.customer.returning"),
      value: String(data.returningCustomers),
      accent: "sky" as const,
    },
    {
      label: t("dashboard.customer.repeatPurchase"),
      value: `${data.repeatPurchasePercent.toFixed(0)}%`,
      accent: "violet" as const,
    },
    {
      label: t("dashboard.customer.topSpender"),
      value: data.highestSpendingCustomer
        ? `${data.highestSpendingCustomer.name} · ${formatMoney(data.highestSpendingCustomer.spendPaisa)}`
        : t("common.none"),
      accent: "amber" as const,
    },
  ]

  return (
    <Card
      size="sm"
      className="overflow-hidden border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 to-card shadow-none dark:border-indigo-800/50 dark:from-indigo-950/30"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm tracking-wide text-indigo-900 uppercase dark:text-indigo-100">
          <Users className="size-4" aria-hidden />
          {t("dashboard.customerAnalytics")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
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
                  "mt-1 flex items-center gap-1.5 text-sm font-semibold",
                  tone.value
                )}
              >
                <UserRound
                  className={cn("size-3.5 shrink-0", tone.icon)}
                  aria-hidden
                />
                <span className="truncate">{item.value}</span>
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
