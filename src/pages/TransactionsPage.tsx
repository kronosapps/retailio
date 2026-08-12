import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { formatMoney } from "@/lib/money"
import {
  TransactionsService,
  type DayTransactions,
} from "@/modules/reports"
import { useAuth } from "@/providers/AuthProvider"

function DayPanel({ data }: { data: DayTransactions }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{data.label}</h2>
          <p className="text-xs text-muted-foreground">
            {data.start.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            Sales{" "}
            <strong className="text-foreground">{data.totals.salesCount}</strong>
          </span>
          <span>
            Paid{" "}
            <strong className="text-foreground tabular-nums">
              {formatMoney(data.totals.paidSalesPaisa)}
            </strong>
          </span>
          <span>
            Refunds{" "}
            <strong className="text-foreground tabular-nums">
              {formatMoney(data.totals.refundsPaisa)}
            </strong>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <TxnTable
          title="Sales"
          description="Invoices created this day"
          empty="No sales"
          headers={["Invoice", "Customer", "Status", "Total"]}
          rows={data.sales.map((sale) => [
            sale.invoiceId,
            sale.customerName || "Walk-in",
            sale.paymentStatus || "Pending",
            formatMoney(sale.totals.total),
          ])}
          linkPrefix="/invoices/"
        />
        <TxnTable
          title="Payments"
          description="Paid and pending payments this day"
          empty="No payments"
          headers={["Payment", "Method", "Status", "Amount"]}
          rows={data.payments.map((payment) => [
            payment.paymentId,
            payment.paymentMethod,
            payment.status,
            formatMoney(payment.amountPaisa),
          ])}
        />
        <TxnTable
          title="Refunds"
          description="Refunds recorded this day"
          empty="No refunds"
          headers={["Refund", "Invoice", "Method", "Amount"]}
          rows={data.refunds.map((refund) => [
            refund.refundId,
            refund.invoiceId,
            refund.method,
            formatMoney(refund.amountPaisa),
          ])}
        />
      </div>
    </section>
  )
}

function TxnTable({
  title,
  description,
  empty,
  headers,
  rows,
  linkPrefix,
}: {
  title: string
  description: string
  empty: string
  headers: string[]
  rows: string[][]
  /** When set, first column links to `${linkPrefix}${row[0]}`. */
  linkPrefix?: string
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ResponsiveList
            cards={rows.map((row, index) => {
              const id = row[0]
              const title =
                linkPrefix && id ? (
                  <Link
                    to={`${linkPrefix}${id}`}
                    className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {id}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{id}</span>
                )
              const metaParts = row.slice(1, -1).filter(Boolean)
              const amount = row[row.length - 1]
              return (
                <MobileListCard
                  key={`${title}-${index}-${id}`}
                  title={title}
                  meta={
                    <>
                      {metaParts.join(" · ")}
                      {amount ? (
                        <span className="mt-0.5 block tabular-nums font-medium text-foreground">
                          {amount}
                        </span>
                      ) : null}
                    </>
                  }
                />
              )
            })}
            table={
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      {headers.map((header) => (
                        <th key={header} className="py-2 pr-2 font-medium">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={`${title}-${index}-${row[0]}`}
                        className="border-b border-border/60 last:border-0"
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`${index}-${cellIndex}`}
                            className={
                              cellIndex === 0
                                ? "py-2 pr-2 font-mono text-xs"
                                : cellIndex === row.length - 1
                                  ? "py-2 tabular-nums"
                                  : "py-2 pr-2"
                            }
                          >
                            {cellIndex === 0 && linkPrefix ? (
                              <Link
                                to={`${linkPrefix}${cell}`}
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                {cell}
                              </Link>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}

export function TransactionsPage() {
  const { profile } = useAuth()
  const [today, setToday] = useState<DayTransactions | null>(null)
  const [yesterday, setYesterday] = useState<DayTransactions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await TransactionsService.loadTodayAndYesterday(
        profile?.storeId ?? null
      )
      setToday(result.today)
      setYesterday(result.yesterday)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load transactions."
      )
    } finally {
      setLoading(false)
    }
  }, [profile?.storeId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            Today and yesterday are listed separately — sales, payments, and
            refunds for each day.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading && !today ? (
        <p className="text-sm text-muted-foreground">Loading transactions…</p>
      ) : (
        <>
          {today ? <DayPanel data={today} /> : null}
          <div className="border-t border-border" />
          {yesterday ? <DayPanel data={yesterday} /> : null}
        </>
      )}
    </div>
  )
}
