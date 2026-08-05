import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import type { CustomerAnalytics } from "../types/dashboard"

export function CustomerAnalyticsPanel({
  data,
}: {
  data: CustomerAnalytics
}) {
  const items = [
    { label: "New customers", value: String(data.newCustomers) },
    { label: "Returning", value: String(data.returningCustomers) },
    {
      label: "Repeat purchase",
      value: `${data.repeatPurchasePercent.toFixed(0)}%`,
    },
    {
      label: "Top spender",
      value: data.highestSpendingCustomer
        ? `${data.highestSpendingCustomer.name} · ${formatMoney(data.highestSpendingCustomer.spendPaisa)}`
        : "—",
    },
  ]

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide uppercase">
          Customer analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
