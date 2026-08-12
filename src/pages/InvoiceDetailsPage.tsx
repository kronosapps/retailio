import { Link, useParams } from "react-router-dom"
import { useEffect, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RecordedSale } from "@/data/invoices"
import { formatMoney } from "@/lib/money"
import { NotificationStatusPanel } from "@/modules/notifications"
import { invoiceRepository } from "@/repositories/InvoiceRepository"

export function InvoiceDetailsPage() {
  const { invoiceId = "" } = useParams()
  const [sale, setSale] = useState<RecordedSale | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void invoiceRepository.getById(invoiceId).then((row) => {
      if (cancelled) return
      if (!row) setError("Invoice not found.")
      else setSale(row)
    })
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Link
          to="/transactions"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
        >
          Back to transactions
        </Link>
      </div>
    )
  }

  if (!sale) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Invoice {sale.invoiceId}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(sale.createdAt).toLocaleString("en-IN")} ·{" "}
            {sale.customerName || "Walk-in"}
          </p>
        </div>
        <Link
          to="/transactions"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
        >
          Back
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sale summary</CardTitle>
            <CardDescription>
              {sale.paymentMethod || "—"} · {sale.paymentStatus || "Pending"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(sale.totals.total)}
            </p>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1 text-left font-medium">Item</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line, index) => (
                  <tr
                    key={`${line.itemId}-${index}`}
                    className="border-b border-border/50"
                  >
                    <td className="py-1.5 pr-2">
                      <div>
                        {line.name}{" "}
                        <span className="text-muted-foreground">
                          {line.weight}
                        </span>
                      </div>
                      {line.priceSnapshot?.explanation ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {line.priceSnapshot.explanation}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.qty}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatMoney(line.lineTotalPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-sm">
              {(sale.totals.couponDiscount ?? 0) > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Coupon {sale.totals.couponCode}</span>
                  <span className="tabular-nums">
                    −{formatMoney(sale.totals.couponDiscount ?? 0)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable</span>
                <span className="tabular-nums">
                  {formatMoney(sale.totals.taxableAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">
                  {formatMoney(sale.totals.gstAmount)}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Grand total</span>
                <span className="tabular-nums">
                  {formatMoney(sale.totals.total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <NotificationStatusPanel
          invoiceId={sale.invoiceId}
          customerName={sale.customerName || "Walk-in"}
          customerPhone={sale.customerPhone}
          paymentId={sale.paymentId}
          customerId={sale.customerId}
          storeId={sale.storeId}
        />
      </div>
    </div>
  )
}
