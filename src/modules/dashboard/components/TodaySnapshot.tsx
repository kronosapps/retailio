import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import type { TodaySnapshot as Snapshot } from "../types/dashboard"

export function TodaySnapshotPanel({ snapshot }: { snapshot: Snapshot }) {
  const rows = [
    { label: "Revenue", value: formatMoney(snapshot.revenuePaisa) },
    {
      label: "Orders",
      value: String(snapshot.orders),
    },
    {
      label: "Customers",
      value: String(snapshot.customers),
    },
    {
      label: "Best seller",
      value: snapshot.bestSellerName || "—",
    },
    {
      label: "Low stock",
      value: String(snapshot.lowStockCount),
    },
    {
      label: "UPI sales",
      value: `${snapshot.upiSharePercent.toFixed(0)}%`,
    },
  ]

  return (
    <Card size="sm" className="h-full min-w-[240px] lg:max-w-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide uppercase">
          Today&apos;s snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="max-w-[60%] truncate text-right font-medium tabular-nums">
              {row.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
