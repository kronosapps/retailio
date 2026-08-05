import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import type { InventoryAnalytics } from "../types/dashboard"

export function InventoryAnalyticsPanel({
  data,
}: {
  data: InventoryAnalytics
}) {
  const items = [
    { label: "Total products", value: String(data.totalProducts) },
    {
      label: "Inventory value",
      value: formatMoney(data.inventoryValuePaisa),
    },
    { label: "Low stock", value: String(data.lowStockCount) },
    { label: "Out of stock", value: String(data.outOfStockCount) },
    { label: "Inactive products", value: String(data.inactiveProducts) },
    {
      label: "Damaged products",
      value: data.damagedProducts === 0 ? "—" : String(data.damagedProducts),
    },
  ]

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide uppercase">
          Inventory analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-sm font-medium tabular-nums">{item.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
