import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

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
        <Link
          to="/reports"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Open full Reports → Items
        </Link>
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
  const [rows, setRows] = useState<OperatorReportRow[]>([])
  useEffect(() => {
    void UtilitiesAnalysisService.operatorReport().then(setRows)
  }, [])
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Report by Operator</h2>
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
  const [rows, setRows] = useState<RoleReportRow[]>([])
  useEffect(() => {
    void UtilitiesAnalysisService.roleReport().then(setRows)
  }, [])
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Report by Role</h2>
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
      <h2 className="text-lg font-semibold">Expense Reports</h2>
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
  const [data, setData] = useState<GstReportSummary | null>(null)
  useEffect(() => {
    void UtilitiesAnalysisService.gstReport().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">GST Reports</h2>
      <StatusBanner
        ready={data.statutoryReady}
        limitations={data.limitations}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Taxable" value={money(data.taxablePaisa)} />
        <Metric label="CGST" value={money(data.cgstPaisa)} />
        <Metric label="SGST" value={money(data.sgstPaisa)} />
        <Metric label="Total GST" value={money(data.gstPaisa)} />
      </div>
      <SimpleTable
        columns={["Rate %", "Taxable", "GST"]}
        rows={data.byRate.map((r) => [
          String(r.rate),
          money(r.taxablePaisa),
          money(r.gstPaisa),
        ])}
      />
    </div>
  )
}

export function TcsReportsPage() {
  return (
    <StatutoryPlaceholder
      title="TCS Reports"
      reasons={[
        "No TCS rate or collection fields on invoices/payments.",
        "No party PAN / collector TAN linkage in sales flow.",
        "Configure TCS rules before enabling statutory output.",
      ]}
    />
  )
}

export function Form27EqPage() {
  return (
    <StatutoryPlaceholder
      title="Form 27EQ"
      reasons={[
        "Form 27EQ requires deductor TAN, party PAN, challan & deposit details.",
        "RetailOS does not currently capture TCS collection/deposit data.",
        "This screen is a scaffold only — not government filing-ready.",
      ]}
    />
  )
}

function StatutoryPlaceholder({
  title,
  reasons,
}: {
  title: string
  reasons: string[]
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <StatusBanner ready={false} limitations={reasons} />
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
