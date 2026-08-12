import { useMemo, useState } from "react"
import { FileSpreadsheet, RefreshCw, Sheet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  REPORT_PERIOD_PRESETS,
  ReportExportService,
  filtersFromPreset,
  formatReportMoney,
  type ItemSort,
  type ReportFilters,
  type ReportPeriodPreset,
  type ReportType,
  type SalesReport,
  type InventoryReport,
  type StockReport,
  type ItemReport,
  type DashboardReport,
} from "@/modules/reporting"
import { useReportQuery } from "@/modules/reporting/queries/useReportQuery"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"
import { paisaAsRupeesNumber } from "@/modules/reporting/utils/report-formatters"

const REPORT_TABS: { id: ReportType; label: string }[] = [
  { id: "dashboard", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "stock", label: "Stock" },
  { id: "items", label: "Items" },
]

const selectClass = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
)

/**
 * Reports UI — read-only. Calls ReportingService + exporters only.
 */
export function ReportsPage() {
  const { profile } = useAuth()
  const [reportType, setReportType] = useState<ReportType>("sales")
  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [category, setCategory] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [itemSort, setItemSort] = useState<ItemSort>("highest_revenue")
  const [generated, setGenerated] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  const filters: ReportFilters = useMemo(() => {
    const custom =
      preset === "custom" && customStart && customEnd
        ? {
            start: new Date(customStart),
            end: new Date(customEnd),
          }
        : undefined
    return filtersFromPreset(
      preset,
      {
        storeId: profile?.storeId ?? null,
        category: category.trim() || null,
        paymentMethod:
          paymentMethod === "Cash" || paymentMethod === "UPI"
            ? paymentMethod
            : null,
      },
      custom
    )
  }, [preset, customStart, customEnd, profile?.storeId, category, paymentMethod])

  const query = useReportQuery(
    reportType,
    filters,
    generated,
    reportType === "items" ? itemSort : undefined
  )

  async function onExportExcel() {
    if (!query.data) return
    setExportBusy(true)
    setExportMsg(null)
    try {
      await ReportExportService.exportExcel(query.data as never)
      setExportMsg("Excel downloaded.")
    } catch (err) {
      setExportMsg(
        err instanceof Error ? err.message : "Excel export failed."
      )
    } finally {
      setExportBusy(false)
    }
  }

  async function onExportSheets() {
    if (!query.data) return
    setExportBusy(true)
    setExportMsg(null)
    try {
      const { result } = await ReportExportService.exportGoogleSheets(
        query.data as never
      )
      if (!result.configured) {
        setExportMsg(result.errors[0] || "Sheets not configured.")
      } else if (result.errors.length) {
        setExportMsg(`Synced with errors: ${result.errors.join("; ")}`)
      } else {
        setExportMsg(`Synced to Sheets: ${result.sheetsSynced.join(", ")}`)
      }
    } catch (err) {
      setExportMsg(
        err instanceof Error ? err.message : "Google Sheets export failed."
      )
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Read-only operational reports. Export to Excel or Google Sheets —
          Firestore stays the source of truth.
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto whitespace-nowrap rounded-lg border bg-muted/40 p-1">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "min-h-10 shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              reportType === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => {
              setReportType(tab.id)
              setGenerated(false)
              setExportMsg(null)
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label>Period</Label>
          <select
            className={selectClass}
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as ReportPeriodPreset)
              setGenerated(false)
            }}
          >
            {REPORT_PERIOD_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div className="space-y-1">
              <Label>Start</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label>Category (optional)</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Halwa"
          />
        </div>
        {reportType === "sales" && (
          <div className="space-y-1">
            <Label>Payment method</Label>
            <select
              className={selectClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">All</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
            </select>
          </div>
        )}
        {reportType === "items" && (
          <div className="space-y-1">
            <Label>Sort</Label>
            <select
              className={selectClass}
              value={itemSort}
              onChange={(e) => setItemSort(e.target.value as ItemSort)}
            >
              <option value="highest_revenue">Highest revenue</option>
              <option value="lowest_revenue">Lowest revenue</option>
              <option value="top_selling">Top selling</option>
              <option value="lowest_selling">Lowest selling</option>
              <option value="highest_stock">Highest stock</option>
              <option value="lowest_stock">Lowest stock</option>
            </select>
          </div>
        )}
        <div className="flex items-end">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setGenerated(true)
              setExportMsg(null)
              void query.refetch()
            }}
          >
            <RefreshCw className="size-4" />
            Generate report
          </Button>
        </div>
      </section>

      {query.isFetching && (
        <p className="text-sm text-muted-foreground">Generating…</p>
      )}
      {query.isError && (
        <p className="text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : "Could not generate report."}
        </p>
      )}

      {query.data && !query.isFetching && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {query.data.storeName} · {query.data.periodLabel}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={exportBusy}
                onClick={() => void onExportExcel()}
              >
                <FileSpreadsheet className="size-4" />
                Export Excel
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={exportBusy}
                onClick={() => void onExportSheets()}
              >
                <Sheet className="size-4" />
                Export to Google Sheets
              </Button>
            </div>
          </div>
          {exportMsg && (
            <p className="text-sm text-muted-foreground">{exportMsg}</p>
          )}

          <ReportBody type={reportType} data={query.data} />
        </>
      )}
    </div>
  )
}

function ReportBody({
  type,
  data,
}: {
  type: ReportType
  data: unknown
}) {
  switch (type) {
    case "sales":
      return <SalesBody report={data as SalesReport} />
    case "inventory":
      return <InventoryBody report={data as InventoryReport} />
    case "stock":
      return <StockBody report={data as StockReport} />
    case "items":
      return <ItemsBody report={data as ItemReport} />
    case "dashboard":
      return <DashboardBody report={data as DashboardReport} />
  }
}

function MetricGrid({
  items,
}: {
  items: { label: string; value: string }[]
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((m) => (
        <div key={m.label} className="rounded-lg border px-4 py-3">
          <p className="text-xs text-muted-foreground">{m.label}</p>
          <p className="text-lg font-semibold tabular-nums">{m.value}</p>
        </div>
      ))}
    </div>
  )
}

function SalesBody({ report }: { report: SalesReport }) {
  const s = report.summary
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Gross sales", value: formatReportMoney(s.grossSalesPaisa) },
          { label: "Discounts", value: formatReportMoney(s.discountsPaisa) },
          { label: "GST", value: formatReportMoney(s.gstPaisa) },
          { label: "Refunds", value: formatReportMoney(s.refundsPaisa) },
          { label: "Net sales", value: formatReportMoney(s.netSalesPaisa) },
          { label: "Net revenue", value: formatReportMoney(s.netRevenuePaisa) },
          { label: "Invoices", value: String(s.invoiceCount) },
          {
            label: "AOV",
            value: formatReportMoney(s.averageOrderValuePaisa),
          },
        ]}
      />
      <DataTable
        columns={[
          "Invoice",
          "Date",
          "Customer",
          "Net",
          "Method",
          "Staff",
          "Status",
        ]}
        rows={report.rows.slice(0, 100).map((r) => [
          r.invoiceId,
          `${r.date} ${r.time}`,
          r.customer,
          formatReportMoney(r.netPaisa),
          r.paymentMethod,
          r.staff,
          r.status,
        ])}
      />
    </div>
  )
}

function InventoryBody({ report }: { report: InventoryReport }) {
  const s = report.summary
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Opening", value: String(s.openingUnits) },
          { label: "Purchased", value: String(s.purchasedUnits) },
          { label: "Sold", value: String(s.soldUnits) },
          { label: "Returns", value: String(s.returnUnits) },
          { label: "Damage", value: String(s.damageUnits) },
          { label: "Wastage", value: String(s.wastageUnits) },
          { label: "Closing", value: String(s.closingUnits) },
          { label: "Movements", value: String(s.movementCount) },
        ]}
      />
      <DataTable
        columns={["Date", "Item", "Type", "Qty", "Reason", "Staff"]}
        rows={report.rows.slice(0, 100).map((r) => [
          r.date,
          `${r.item} (${r.sku})`,
          r.movementType,
          String(r.signedQuantity),
          r.reason,
          r.staff,
        ])}
      />
    </div>
  )
}

function StockBody({ report }: { report: StockReport }) {
  const s = report.summary
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Items", value: String(s.totalItems) },
          { label: "Units", value: String(s.totalUnits) },
          {
            label: "Stock value",
            value: formatReportMoney(s.stockValuePaisa),
          },
          {
            label: "Potential sales",
            value: formatReportMoney(s.potentialSalesValuePaisa),
          },
          { label: "Low stock", value: String(s.lowStockCount) },
          { label: "Out of stock", value: String(s.outOfStockCount) },
        ]}
      />
      <DataTable
        columns={[
          "Item",
          "SKU",
          "Stock",
          "Reorder",
          "Status",
          "Value",
          "Potential",
        ]}
        rows={report.rows.slice(0, 100).map((r) => [
          r.item,
          r.sku,
          String(r.currentStock),
          String(r.reorderLevel),
          r.statusLabel,
          formatReportMoney(r.stockValuePaisa),
          formatReportMoney(r.potentialSalesValuePaisa),
        ])}
      />
    </div>
  )
}

function ItemsBody({ report }: { report: ItemReport }) {
  const s = report.summary
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          { label: "Items", value: String(s.itemCount) },
          { label: "Units sold", value: String(s.unitsSold) },
          { label: "Gross", value: formatReportMoney(s.grossSalesPaisa) },
          { label: "Net", value: formatReportMoney(s.netSalesPaisa) },
        ]}
      />
      <DataTable
        columns={[
          "Item",
          "SKU",
          "Units",
          "Net",
          "Avg price",
          "Stock",
          "Status",
        ]}
        rows={report.rows.slice(0, 100).map((r) => [
          r.item,
          r.sku,
          String(r.unitsSold),
          formatReportMoney(r.netSalesPaisa),
          formatReportMoney(r.averageSellingPricePaisa),
          String(r.currentStock),
          r.statusLabel,
        ])}
      />
    </div>
  )
}

function DashboardBody({ report }: { report: DashboardReport }) {
  const s = report.summary
  const pct = (v: number | null) =>
    v == null ? "—" : `${v >= 0 ? "↑" : "↓"} ${Math.abs(v).toFixed(1)}%`
  return (
    <div className="space-y-4">
      <MetricGrid
        items={[
          {
            label: `Sales ${pct(s.salesChangePercent)}`,
            value: formatReportMoney(s.totalSalesPaisa),
          },
          {
            label: `Invoices ${pct(s.invoiceChangePercent)}`,
            value: String(s.invoiceCount),
          },
          {
            label: `AOV ${pct(s.aovChangePercent)}`,
            value: formatReportMoney(s.averageOrderValuePaisa),
          },
          {
            label: "Refunds",
            value: formatReportMoney(s.refundsPaisa),
          },
          { label: "Low stock", value: String(s.lowStockCount) },
          { label: "Out of stock", value: String(s.outOfStockCount) },
        ]}
      />
      <DataTable
        columns={["Item", "Qty", "Revenue (₹)"]}
        rows={report.topItems.map((t) => [
          t.name,
          String(t.qty),
          String(paisaAsRupeesNumber(t.revenuePaisa)),
        ])}
      />
    </div>
  )
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                No rows for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
