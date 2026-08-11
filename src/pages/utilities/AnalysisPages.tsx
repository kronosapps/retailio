import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import {
  ReportingService,
  filtersFromPreset,
  formatReportMoney,
  type ItemReport,
} from "@/modules/reporting"
import {
  UtilitiesAnalysisService,
  type ExpenseReportSummary,
  type GstReportSummary,
  type OperatorReportRow,
  type RoleReportRow,
} from "@/modules/utilities"
import { UtilitiesExportService } from "@/modules/utilities/UtilitiesExportService"
import type { ExpenseRecord } from "@/modules/expense/ExpenseService"
import { useAuth } from "@/providers/AuthProvider"

function money(p: number) {
  return formatReportMoney(p)
}

export function UtilityItemReportPage() {
  const { profile } = useAuth()
  const [report, setReport] = useState<ItemReport | null>(null)
  useEffect(() => {
    const filters = filtersFromPreset("this_month", {
      storeId: profile?.storeId ?? null,
    })
    void ReportingService.getItemReport(filters, "highest_revenue").then(
      setReport
    )
  }, [profile?.storeId])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Report by Item</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void UtilitiesExportService.exportItemReport(profile?.storeId)
            }
          >
            Export Excel
          </Button>
          <Link
            to="/reports"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Open full Reports → Items
          </Link>
        </div>
      </div>
      {!report ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <SimpleTable
          columns={["Item", "SKU", "Units", "Net", "Stock"]}
          rows={report.rows.slice(0, 80).map((r) => [
            r.item,
            r.sku,
            String(r.unitsSold),
            money(r.netSalesPaisa),
            String(r.currentStock),
          ])}
        />
      )}
    </div>
  )
}

export function OperatorReportPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<OperatorReportRow[]>([])
  useEffect(() => {
    void UtilitiesAnalysisService.operatorReport().then(setRows)
  }, [])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Report by Operator</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void UtilitiesExportService.exportOperatorReport(profile?.storeId)
          }
        >
          Export Excel
        </Button>
      </div>
      <SimpleTable
        columns={[
          "Operator",
          "Role",
          "Invoices",
          "Net Sales",
          "Cash",
          "UPI",
          "Refunds",
          "AOV",
        ]}
        rows={rows.map((r) => [
          r.operatorName,
          r.role,
          String(r.invoices),
          money(r.netSalesPaisa),
          money(r.cashSalesPaisa),
          money(r.upiSalesPaisa),
          money(r.refundsPaisa),
          money(r.averageTransactionPaisa),
        ])}
      />
    </div>
  )
}

export function RoleReportPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<RoleReportRow[]>([])
  useEffect(() => {
    void UtilitiesAnalysisService.roleReport().then(setRows)
  }, [])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Report by Role</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void UtilitiesExportService.exportRoleReport(profile?.storeId)
          }
        >
          Export Excel
        </Button>
      </div>
      <SimpleTable
        columns={["Role", "Transactions", "Sales", "Refunds"]}
        rows={rows.map((r) => [
          r.role,
          String(r.transactions),
          money(r.salesPaisa),
          money(r.refundsPaisa),
        ])}
      />
    </div>
  )
}

export function ExpenseReportPage() {
  const { profile } = useAuth()
  const [summary, setSummary] = useState<ExpenseReportSummary | null>(null)
  const [rows, setRows] = useState<ExpenseRecord[]>([])
  useEffect(() => {
    void UtilitiesAnalysisService.expenseReport().then((r) => {
      setSummary(r.summary)
      setRows(r.rows)
    })
  }, [])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Expense Reports</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void UtilitiesExportService.exportExpenseReport(profile?.storeId)
            }
          >
            Export Excel
          </Button>
          <Link
            to="/utilities/expenses"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Add expense
          </Link>
        </div>
      </div>
      {summary && (
        <p className="text-sm">
          Total {money(summary.totalPaisa)} · {summary.count} expenses (active
          FY)
        </p>
      )}
      <SimpleTable
        columns={["Date", "Title", "Category", "Amount"]}
        rows={rows.map((r) => [
          new Date(r.createdAt).toLocaleString(),
          r.title,
          r.category || "—",
          money(r.amountPaisa),
        ])}
      />
    </div>
  )
}

export function GstReportsPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<GstReportSummary | null>(null)
  useEffect(() => {
    void UtilitiesAnalysisService.gstReport(profile?.storeId ?? null).then(
      setData
    )
  }, [profile?.storeId])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">GST Reports</h2>
          <p className="text-sm text-muted-foreground">{data.periodLabel}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void UtilitiesExportService.exportGstReport(profile?.storeId)
          }
        >
          Export Excel
        </Button>
      </div>
      <StatusBanner
        ready={data.meta.filingReady}
        limitations={[
          ...data.meta.notes,
          ...data.meta.missingFields.map((f) => `Missing: ${f}`),
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Taxable" value={money(data.taxablePaisa)} />
        <Metric label="CGST" value={money(data.cgstPaisa)} />
        <Metric label="SGST" value={money(data.sgstPaisa)} />
        <Metric label="Total GST" value={money(data.gstPaisa)} />
      </div>
      <SimpleTable
        columns={["Rate %", "Taxable", "CGST", "SGST", "GST"]}
        rows={data.byRate.map((r) => [
          String(r.rate),
          money(r.taxablePaisa),
          money(r.cgstPaisa),
          money(r.sgstPaisa),
          money(r.gstPaisa),
        ])}
      />
      <SimpleTable
        columns={["Party bucket", "Invoices", "Taxable", "GST"]}
        rows={data.byParty.map((r) => [
          r.bucket.toUpperCase(),
          String(r.invoiceCount),
          money(r.taxablePaisa),
          money(r.gstPaisa),
        ])}
      />
    </div>
  )
}

export function TcsReportsPage() {
  const { profile } = useAuth()
  const storeId = profile?.storeId || "store-1"
  const [data, setData] = useState<Awaited<
    ReturnType<typeof import("@/modules/statutory").StatutoryService.getTcsScaffold>
  > | null>(null)

  useEffect(() => {
    void import("@/modules/statutory").then(({ StatutoryService }) =>
      StatutoryService.getTcsScaffold(storeId).then(setData)
    )
  }, [storeId])

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">TCS Reports</h2>
          <p className="text-sm text-muted-foreground">{data.periodLabel}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void UtilitiesExportService.exportTcsReport(storeId)}
        >
          Export Excel
        </Button>
      </div>
      <StatusBanner
        ready={data.meta.filingReady}
        limitations={[
          ...data.meta.notes,
          ...data.meta.missingFields.map((f) => `Missing: ${f}`),
        ]}
      />
      <p className="text-sm">
        Total TCS {money(data.totalTcsPaisa)} · {data.transactions.length}{" "}
        transactions
      </p>
      <SimpleTable
        columns={[
          "Date",
          "Party",
          "PAN",
          "Taxable",
          "Rate %",
          "TCS",
          "Challan",
          "Status",
        ]}
        rows={data.transactions.map((t) => [
          t.date,
          t.partyName,
          t.partyPan || "—",
          money(t.taxablePaisa),
          t.tcsRatePercent == null ? "—" : String(t.tcsRatePercent),
          t.tcsAmountPaisa == null ? "—" : money(t.tcsAmountPaisa),
          t.challanNumber || "—",
          t.status,
        ])}
      />
    </div>
  )
}

export function Form27EqPage() {
  const { profile } = useAuth()
  const storeId = profile?.storeId || "store-1"
  const [data, setData] = useState<Awaited<
    ReturnType<
      typeof import("@/modules/statutory").StatutoryService.getForm27EqScaffold
    >
  > | null>(null)

  useEffect(() => {
    void import("@/modules/statutory").then(({ StatutoryService }) =>
      StatutoryService.getForm27EqScaffold(storeId).then(setData)
    )
  }, [storeId])

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Form 27EQ</h2>
          <p className="text-sm text-muted-foreground">{data.periodLabel}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void UtilitiesExportService.exportForm27Eq(storeId)}
        >
          Export Excel
        </Button>
      </div>
      <StatusBanner
        ready={data.meta.filingReady}
        limitations={[
          ...data.meta.notes,
          ...data.meta.missingFields.map((f) => `Missing: ${f}`),
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Deductor TAN" value={data.deductorTan || "—"} />
        <Metric label="Deductor name" value={data.deductorName || "—"} />
      </div>
      <SimpleTable
        columns={[
          "S.No",
          "Party",
          "PAN",
          "Amount paid",
          "TCS",
          "Collection code",
          "Challan",
          "BSR",
          "Deposit date",
        ]}
        rows={data.rows.map((r) => [
          String(r.serial),
          r.partyName,
          r.partyPan || "—",
          r.amountPaidPaisa == null ? "—" : money(r.amountPaidPaisa),
          r.tcsCollectedPaisa == null ? "—" : money(r.tcsCollectedPaisa),
          r.collectionCode || "—",
          r.challanNumber || "—",
          r.bsrCode || "—",
          r.depositDate || "—",
        ])}
      />
    </div>
  )
}

function StatusBanner({
  ready,
  limitations,
}: {
  ready: boolean
  limitations: string[]
}) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p className="font-medium">
        Status: {ready ? "Statutory-ready" : "Not statutory-ready"}
      </p>
      <p className="mt-1 text-xs">Operational report only unless marked ready.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
        {limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[560px] text-left text-sm">
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
                <td key={j} className="px-3 py-1.5">
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
                No data for active financial year.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
