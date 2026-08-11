import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  AccountingService,
  type AccountStatementResult,
  type BalanceSheetResult,
  type CashFlowResult,
  type DaybookRow,
  type TrialBalanceResult,
} from "@/modules/accounting"
import { formatReportMoney } from "@/modules/reporting"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { cn } from "@/lib/utils"

function money(p: number) {
  return formatReportMoney(p)
}

export function DaybookPage() {
  const [rows, setRows] = useState<DaybookRow[]>([])
  useEffect(() => {
    void AccountingService.getDaybook().then(setRows)
  }, [])
  return (
    <AccountingTable
      title="Daybook"
      note="Projected chronological journal activity for the active financial year."
      columns={["Date", "Time", "Type", "Description", "Debit", "Credit", "Operator"]}
      rows={rows.map((r) => [
        r.date,
        r.time,
        r.type,
        r.description,
        money(r.debitPaisa),
        money(r.creditPaisa),
        r.operator,
      ])}
    />
  )
}

export function AllTransactionsPage() {
  const [rows, setRows] = useState<string[][]>([])
  useEffect(() => {
    void (async () => {
      const [invoices, payments, refunds] = await Promise.all([
        invoiceRepository.list(),
        paymentRepository.list(),
        refundRepository.list(),
      ])
      const out: string[][] = []
      for (const s of invoices) {
        out.push([
          new Date(s.createdAt).toLocaleString(),
          s.invoiceId,
          "Sale",
          s.customerName || "Walk-in",
          money(s.totals.total),
          s.paymentMethod || "—",
          s.cashierName || "—",
          s.paymentStatus || "—",
        ])
      }
      for (const p of payments) {
        out.push([
          new Date(p.paidAt || p.createdAt).toLocaleString(),
          p.paymentId,
          "Payment",
          p.customerName || "—",
          money(p.amountPaisa),
          p.paymentMethod,
          "—",
          p.status,
        ])
      }
      for (const r of refunds) {
        out.push([
          new Date(r.createdAt).toLocaleString(),
          r.refundId,
          "Refund",
          r.customerName || "—",
          money(r.amountPaisa),
          r.method,
          "—",
          r.status || "Refunded",
        ])
      }
      out.sort((a, b) => b[0].localeCompare(a[0]))
      setRows(out)
    })()
  }, [])
  return (
    <AccountingTable
      title="All Transactions"
      note="Consolidated sales, payments, and refunds (read-only)."
      columns={[
        "Date",
        "ID",
        "Type",
        "Description",
        "Amount",
        "Method",
        "Operator",
        "Status",
      ]}
      rows={rows}
    />
  )
}

export function TrialBalancePage() {
  const [data, setData] = useState<TrialBalanceResult | null>(null)
  useEffect(() => {
    void AccountingService.getTrialBalance().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header
        title="Trial Balance"
        subtitle={data.periodLabel}
        note={data.projectionNote}
      />
      {!data.isBalanced && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Accounting integrity warning: Debit ≠ Credit (imbalance{" "}
          {money(Math.abs(data.imbalancePaisa))}).
        </p>
      )}
      <AccountingTable
        columns={["Account", "Code", "Debit", "Credit"]}
        rows={[
          ...data.rows.map((r) => [
            r.accountName,
            r.accountCode,
            r.debitPaisa ? money(r.debitPaisa) : "",
            r.creditPaisa ? money(r.creditPaisa) : "",
          ]),
          [
            "TOTAL",
            "",
            money(data.totalDebitPaisa),
            money(data.totalCreditPaisa),
          ],
        ]}
      />
    </div>
  )
}

export function BalanceSheetPage() {
  const [data, setData] = useState<BalanceSheetResult | null>(null)
  useEffect(() => {
    void AccountingService.getBalanceSheet().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header title="Balance Sheet" subtitle={`As of ${data.periodLabel}`} />
      {data.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Liabilities & Equity"
          rows={[
            ...data.liabilities.map((r) => [r.accountName, money(r.amountPaisa)]),
            ...data.equity.map((r) => [
              r.accountName + (r.provisional ? " *" : ""),
              money(r.amountPaisa),
            ]),
            [
              "TOTAL",
              money(data.totalLiabilitiesPaisa + data.totalEquityPaisa),
            ],
          ]}
        />
        <Section
          title="Assets"
          rows={[
            ...data.assets.map((r) => [r.accountName, money(r.amountPaisa)]),
            ["TOTAL", money(data.totalAssetsPaisa)],
          ]}
        />
      </div>
      {!data.isBalanced && (
        <p className="text-sm text-amber-800">
          Sheet does not balance — projection incomplete or openings missing.
        </p>
      )}
    </div>
  )
}

export function CashFlowPage() {
  const [data, setData] = useState<CashFlowResult | null>(null)
  useEffect(() => {
    void AccountingService.getCashFlow().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header title="Cash Flow" subtitle={data.periodLabel} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Opening cash" value={money(data.openingCashPaisa)} />
        <Metric label="Opening UPI" value={money(data.openingUpiPaisa)} />
        <Metric label="Closing cash" value={money(data.closingCashPaisa)} />
        <Metric label="Closing UPI" value={money(data.closingUpiPaisa)} />
        <Metric label="Cash in" value={money(data.cashInPaisa)} />
        <Metric label="Cash out" value={money(data.cashOutPaisa)} />
        <Metric label="UPI in" value={money(data.upiInPaisa)} />
        <Metric label="UPI out" value={money(data.upiOutPaisa)} />
      </div>
      {data.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  )
}

export function AccountStatementPage() {
  const accounts = AccountingService.listAccounts()
  const [code, setCode] = useState(accounts[0]?.code || "1000")
  const [data, setData] = useState<AccountStatementResult | null>(null)

  useEffect(() => {
    void AccountingService.getAccountStatement(code).then(setData)
  }, [code])

  return (
    <div className="space-y-4">
      <Header title="Account Statement" subtitle={data?.periodLabel} />
      <select
        className={cn(
          "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
        )}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} — {a.name}
          </option>
        ))}
      </select>
      {data && (
        <>
          <p className="text-sm">
            Closing balance: <strong>{money(data.closingBalancePaisa)}</strong>
          </p>
          <AccountingTable
            columns={["Date", "Description", "Debit", "Credit", "Balance"]}
            rows={data.lines.map((l) => [
              l.date,
              l.description,
              l.debitPaisa ? money(l.debitPaisa) : "",
              l.creditPaisa ? money(l.creditPaisa) : "",
              money(l.balancePaisa),
            ])}
          />
        </>
      )}
    </div>
  )
}

function Header({
  title,
  subtitle,
  note,
}: {
  title: string
  subtitle?: string
  note?: string
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && (
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      )}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Section({
  title,
  rows,
}: {
  title: string
  rows: string[][]
}) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="px-3 py-1.5">{r[0]}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccountingTable({
  title,
  note,
  columns,
  rows,
}: {
  title?: string
  note?: string
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="space-y-3">
      {title && <Header title={title} note={note} />}
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
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {title && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          Print
        </Button>
      )}
    </div>
  )
}
