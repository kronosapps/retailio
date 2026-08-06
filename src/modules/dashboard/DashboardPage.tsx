import { Suspense, lazy, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  RefundDialog,
  type RefundDialogTarget,
} from "@/modules/refund"

import { BusinessInsights } from "./components/BusinessInsights"
import { CustomerAnalyticsPanel } from "./components/CustomerAnalyticsPanel"
import { FilterBar } from "./components/FilterBar"
import { InventoryAnalyticsPanel } from "./components/InventoryAnalyticsPanel"
import { QuickActions } from "./components/QuickActions"
import { TodaySnapshotPanel } from "./components/TodaySnapshot"
import { KpiCard, KpiCardSkeleton } from "./components/cards/KpiCard"
import { ChartSkeleton } from "./components/charts/DashboardCharts"
import {
  RecentSalesTable,
  StockTable,
  TableSkeleton,
  TopProductsTable,
} from "./components/tables/DashboardTables"
import { useDashboard } from "./hooks/useDashboard"

const ChartsSection = lazy(() =>
  import("./components/charts/ChartsSection").then((m) => ({
    default: m.ChartsSection,
  }))
)

export function DashboardPage() {
  const {
    data,
    loading,
    error,
    refresh,
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
  } = useDashboard()
  const [refundTarget, setRefundTarget] = useState<RefundDialogTarget | null>(
    null
  )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Store performance overview — sales, customers, and inventory.
          </p>
          <div className="pt-2">
            <QuickActions />
          </div>
        </div>
        {data ? <TodaySnapshotPanel snapshot={data.snapshot} /> : null}
      </div>

      <FilterBar
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        onRefresh={refresh}
        refreshing={loading}
        generatedAt={data?.generatedAt}
      />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? Array.from({ length: 8 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : data
            ? (
                <>
                  <KpiCard title="Total revenue" kpi={data.kpis.totalRevenue} />
                  <KpiCard
                    title="Gross profit"
                    kpi={data.kpis.grossProfit}
                    hint={
                      data.meta.profitApproximate
                        ? "Approximate — add purchase prices for accuracy"
                        : undefined
                    }
                  />
                  <KpiCard title="Orders" kpi={data.kpis.orders} />
                  <KpiCard
                    title="Average order value"
                    kpi={data.kpis.averageOrderValue}
                  />
                  <KpiCard title="Customers" kpi={data.kpis.customers} />
                  <KpiCard
                    title="Inventory value"
                    kpi={data.kpis.inventoryValue}
                  />
                  <KpiCard
                    title="Pending payments"
                    kpi={data.kpis.pendingPayments}
                  />
                  <KpiCard title="Refunds" kpi={data.kpis.refunds} />
                </>
              )
            : null}
      </section>

      {data ? <BusinessInsights insights={data.insights} /> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Charts
        </h2>
        {loading && !data ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <ChartSkeleton key={i} />
            ))}
          </div>
        ) : data ? (
          <Suspense
            fallback={
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ChartSkeleton key={i} />
                ))}
              </div>
            }
          >
            <ChartsSection
              revenueTrend={data.charts.revenueTrend}
              paymentMethods={data.charts.paymentMethods}
              categorySales={data.charts.categorySales}
              topProducts={data.charts.topProducts}
              hourlySales={data.charts.hourlySales}
            />
          </Suspense>
        ) : null}
      </section>

      {data ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <CustomerAnalyticsPanel data={data.customers} />
          <InventoryAnalyticsPanel data={data.inventory} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Details
        </h2>
        {loading && !data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <TableSkeleton key={i} />
            ))}
          </div>
        ) : data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <TopProductsTable rows={data.tables.topProducts} />
            <RecentSalesTable
              rows={data.tables.recentSales}
              onRefund={(row) =>
                setRefundTarget({
                  invoiceId: row.invoiceId,
                  customerName: row.customerName,
                  totalPaisa: row.totalPaisa,
                  paymentMethod: row.paymentMethod,
                })
              }
            />
            <StockTable title="Low stock items" rows={data.tables.lowStock} />
            <StockTable
              title="Out of stock items"
              rows={data.tables.outOfStock}
            />
          </div>
        ) : null}
      </section>

      <RefundDialog
        target={refundTarget}
        open={Boolean(refundTarget)}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null)
        }}
        onCompleted={() => {
          setRefundTarget(null)
          refresh()
        }}
      />
    </div>
  )
}
