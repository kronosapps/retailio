import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AccountingService,
  ACCOUNT_CODES,
  type AccountStatementResult,
  type BalanceSheetResult,
  type CashFlowResult,
  type DaybookRow,
  type ProfitAndLossResult,
  type TrialBalanceResult,
} from "@/modules/accounting"
import { formatReportMoney } from "@/modules/reporting"
import { UtilitiesExportService } from "@/modules/utilities/UtilitiesExportService"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

function money(p: number) {
  return formatReportMoney(p)
}

export function DaybookPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DaybookRow[]>([])
  useEffect(() => {
    void AccountingService.getDaybook().then(setRows)
  }, [])
  return (
    <AccountingTable
      title="Daybook"
      note="Hybrid posted GL with projection backfill for the active financial year."
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
      onExport={() =>
        void UtilitiesExportService.exportDaybook(profile?.storeId)
      }
    />
  )
}

export function AllTransactionsPage() {
  const { profile } = useAuth()
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
      onExport={() =>
        void UtilitiesExportService.exportAllTransactions(profile?.storeId)
      }
    />
  )
}

export function TrialBalancePage() {
  const { profile } = useAuth()
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
        onExport={() =>
          void UtilitiesExportService.exportTrialBalance(profile?.storeId)
        }
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
  const { profile } = useAuth()
  const [data, setData] = useState<BalanceSheetResult | null>(null)
  useEffect(() => {
    void AccountingService.getBalanceSheet().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header
        title="Balance Sheet"
        subtitle={`As of ${data.periodLabel}`}
        onExport={() =>
          void UtilitiesExportService.exportBalanceSheet(profile?.storeId)
        }
      />
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

export function ProfitAndLossPage() {
  const [data, setData] = useState<ProfitAndLossResult | null>(null)
  useEffect(() => {
    void AccountingService.getProfitAndLoss().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header title="Profit & Loss" subtitle={data.periodLabel} />
      {data.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Gross profit" value={money(data.grossProfitPaisa)} />
        <Metric label="Total income" value={money(data.totalIncomePaisa)} />
        <Metric
          label="Net profit"
          value={money(data.netProfitPaisa)}
          emphasize
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Income"
          rows={[
            ...data.income.map((r) => [
              `${r.accountName} (${r.accountCode})`,
              money(r.amountPaisa),
            ]),
            ["TOTAL INCOME", money(data.totalIncomePaisa)],
          ]}
        />
        <Section
          title="Expenses"
          rows={[
            ...data.expenses.map((r) => [
              `${r.accountName} (${r.accountCode})`,
              money(r.amountPaisa),
            ]),
            ["TOTAL EXPENSES", money(data.totalExpensesPaisa)],
            ["NET PROFIT", money(data.netProfitPaisa)],
          ]}
        />
      </div>
    </div>
  )
}

export function ChartOfAccountsPage() {
  const accounts = AccountingService.listAccounts()
  const byType = {
    asset: accounts.filter((a) => a.type === "asset"),
    liability: accounts.filter((a) => a.type === "liability"),
    equity: accounts.filter((a) => a.type === "equity"),
    income: accounts.filter((a) => a.type === "income"),
    expense: accounts.filter((a) => a.type === "expense"),
  }
  return (
    <div className="space-y-4">
      <Header
        title="Chart of Accounts"
        note="Single-company retail CoA. Codes are fixed for posting rules (Sale → Payment → JE, Purchase → AP → JE, Expense → Cash/UPI → JE). No multi-company."
      />
      {(
        [
          ["Assets", byType.asset],
          ["Liabilities", byType.liability],
          ["Equity", byType.equity],
          ["Income", byType.income],
          ["Expenses", byType.expense],
        ] as const
      ).map(([title, rows]) => (
        <AccountingTable
          key={title}
          title={title}
          columns={["Code", "Account", "Normal balance"]}
          rows={rows.map((a) => [a.code, a.name, a.normalBalance])}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        Key codes: Cash {ACCOUNT_CODES.CASH} · UPI {ACCOUNT_CODES.UPI} · AR{" "}
        {ACCOUNT_CODES.AR} · AP {ACCOUNT_CODES.AP} · Sales {ACCOUNT_CODES.SALES}{" "}
        · COGS {ACCOUNT_CODES.COGS} · Expenses {ACCOUNT_CODES.EXPENSES}
      </p>
    </div>
  )
}

type ManualLineDraft = {
  accountCode: string
  debit: string
  credit: string
}

export function ManualJournalPage() {
  const { userId, profile } = useAuth()
  const accounts = AccountingService.listAccounts()
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<ManualLineDraft[]>([
    { accountCode: ACCOUNT_CODES.EXPENSES, debit: "", credit: "" },
    { accountCode: ACCOUNT_CODES.CASH, debit: "", credit: "" },
  ])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const debitTotal = lines.reduce(
    (s, l) => s + Math.round((Number(l.debit) || 0) * 100),
    0
  )
  const creditTotal = lines.reduce(
    (s, l) => s + Math.round((Number(l.credit) || 0) * 100),
    0
  )

  async function submit() {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      const entry = await AccountingService.postManualJournal({
        description,
        date,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          debitPaisa: Math.round((Number(l.debit) || 0) * 100),
          creditPaisa: Math.round((Number(l.credit) || 0) * 100),
        })),
        actorId: userId,
        actorName: profile?.displayName || profile?.email || null,
        storeId: profile?.storeId ?? null,
      })
      setOk(`Posted ${entry.id}`)
      setDescription("")
      setLines([
        { accountCode: ACCOUNT_CODES.EXPENSES, debit: "", credit: "" },
        { accountCode: ACCOUNT_CODES.CASH, debit: "", credit: "" },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post journal.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Header
        title="Manual Journal"
        note="Lightweight adjusting entries. Debits must equal credits. Prefer automatic posting from Sale/Payment/Purchase/Expense when possible."
      />
      <div className="space-y-1">
        <Label>Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Owner drawing / adjustment"
        />
      </div>
      <div className="space-y-1">
        <Label>Date</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Lines (₹)</Label>
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={line.accountCode}
              onChange={(e) => {
                const next = [...lines]
                next[i] = { ...line, accountCode: e.target.value }
                setLines(next)
              }}
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Debit"
              value={line.debit}
              onChange={(e) => {
                const next = [...lines]
                next[i] = { ...line, debit: e.target.value, credit: "" }
                setLines(next)
              }}
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Credit"
              value={line.credit}
              onChange={(e) => {
                const next = [...lines]
                next[i] = { ...line, credit: e.target.value, debit: "" }
                setLines(next)
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={lines.length <= 2}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setLines([
              ...lines,
              { accountCode: ACCOUNT_CODES.CASH, debit: "", credit: "" },
            ])
          }
        >
          Add line
        </Button>
      </div>
      <p
        className={cn(
          "text-xs",
          debitTotal === creditTotal && debitTotal > 0
            ? "text-muted-foreground"
            : "text-amber-700"
        )}
      >
        Debit {money(debitTotal)} · Credit {money(creditTotal)}
        {debitTotal !== creditTotal ? " — not balanced" : ""}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {ok ? <p className="text-xs text-muted-foreground">{ok}</p> : null}
      <Button
        type="button"
        disabled={busy || !description.trim() || debitTotal !== creditTotal}
        onClick={() => void submit()}
      >
        {busy ? "Posting…" : "Post journal"}
      </Button>
    </div>
  )
}

/** Hub: single-company accounting map + deep links. */
export function AccountingHubPage() {
  const links: { title: string; path: string; blurb: string }[] = [
    {
      title: "Chart of Accounts",
      path: "/utilities/chart-of-accounts",
      blurb: "Ledger codes for assets, liabilities, equity, income, expense",
    },
    {
      title: "Daybook",
      path: "/utilities/daybook",
      blurb: "Chronological journals (posted + projected)",
    },
    {
      title: "Manual Journal",
      path: "/utilities/manual-journal",
      blurb: "Balanced adjusting entries when ops pipelines do not cover it",
    },
    {
      title: "Account Statement",
      path: "/utilities/account-statement",
      blurb: "One ledger account’s activity and closing balance",
    },
    {
      title: "Trial Balance",
      path: "/utilities/trial-balance",
      blurb: "Debit / credit by account for the active FY",
    },
    {
      title: "Profit & Loss",
      path: "/utilities/profit-loss",
      blurb: "Income, expenses, gross and net profit",
    },
    {
      title: "Balance Sheet",
      path: "/utilities/balance-sheet",
      blurb: "Assets vs liabilities & equity (incl. period RE)",
    },
    {
      title: "Cash Flow",
      path: "/utilities/cash-flow",
      blurb: "Operating cash / UPI from banking (lightweight)",
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Accounting</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Lightweight single-company GL for retail ERP — not a multi-entity SaaS.
          Operational flows post journals automatically:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>Sale → Payment → Accounting entry (AR / cash / UPI + sales + COGS)</li>
          <li>Purchase → Payable → Accounting entry (AP settle on supplier payment)</li>
          <li>Expense → Cash/Bank → Accounting entry</li>
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link
            key={l.path}
            to={l.path}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <p className="font-medium">{l.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{l.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function CashFlowPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<CashFlowResult | null>(null)
  useEffect(() => {
    void AccountingService.getCashFlow().then(setData)
  }, [])
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return (
    <div className="space-y-4">
      <Header
        title="Cash Flow"
        subtitle={data.periodLabel}
        onExport={() =>
          void UtilitiesExportService.exportCashFlow(profile?.storeId)
        }
      />
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
  const { profile } = useAuth()
  const accounts = AccountingService.listAccounts()
  const [code, setCode] = useState(accounts[0]?.code || "1000")
  const [data, setData] = useState<AccountStatementResult | null>(null)

  useEffect(() => {
    void AccountingService.getAccountStatement(code).then(setData)
  }, [code])

  return (
    <div className="space-y-4">
      <Header
        title="Account Statement"
        subtitle={data?.periodLabel}
        onExport={() =>
          void UtilitiesExportService.exportAccountStatement(
            code,
            profile?.storeId
          )
        }
      />
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
  onExport,
}: {
  title: string
  subtitle?: string
  note?: string
  onExport?: () => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
      <Toolbar onExport={onExport} />
    </div>
  )
}

function Toolbar({ onExport }: { onExport?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {onExport ? (
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          Export Excel
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.print()}
      >
        Print
      </Button>
    </div>
  )
}

function Metric({
  label,
  value,
  emphasize,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        emphasize && "border-foreground/20 bg-muted/30"
      )}
    >
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
  onExport,
}: {
  title?: string
  note?: string
  columns: string[]
  rows: string[][]
  onExport?: () => void
}) {
  return (
    <div className="space-y-3">
      {title ? (
        <Header title={title} note={note} onExport={onExport} />
      ) : null}
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
    </div>
  )
}
