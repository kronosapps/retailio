import type { NamedValue, SeriesPoint } from "../../types/dashboard"
import {
  CategorySalesChart,
  HourlySalesChart,
  PaymentMethodsChart,
  RevenueTrendChart,
  TopProductsChart,
} from "./DashboardCharts"

export function ChartsSection({
  revenueTrend,
  paymentMethods,
  categorySales,
  topProducts,
  hourlySales,
}: {
  revenueTrend: SeriesPoint[]
  paymentMethods: NamedValue[]
  categorySales: NamedValue[]
  topProducts: NamedValue[]
  hourlySales: SeriesPoint[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <RevenueTrendChart data={revenueTrend} />
      </div>
      <PaymentMethodsChart data={paymentMethods} />
      <CategorySalesChart data={categorySales} />
      <TopProductsChart data={topProducts} />
      <div className="lg:col-span-2 xl:col-span-1">
        <HourlySalesChart data={hourlySales} />
      </div>
    </div>
  )
}
