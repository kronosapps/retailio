import { useMemo, useState } from "react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { formatMoney } from "@/lib/money"
import { SupplierPaymentService } from "@/modules/purchasing"

/**
 * Purchasing → Supplier Payments — settlement history.
 */
export function SupplierPaymentsView() {
  const [tick] = useState(0)

  const payments = useMemo(() => {
    void tick
    return SupplierPaymentService.list()
  }, [tick])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Supplier Payments</h2>
        <p className="text-sm text-muted-foreground">
          Payments recorded against purchase invoices (Cash / UPI). Record new
          payments from the Purchase Invoices tab.
        </p>
      </div>

      <ResponsiveList
        cards={
          payments.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No supplier payments yet.
            </p>
          ) : (
            payments.map((p) => (
              <MobileListCard
                key={p.id}
                title={p.paymentNumber}
                meta={
                  <>
                    <div>
                      {p.supplierName} · {p.invoiceNumber}
                    </div>
                    <div>
                      {new Date(p.paidAt).toLocaleString()} · {p.method} ·{" "}
                      {formatMoney(p.amountPaisa)}
                    </div>
                  </>
                }
              />
            ))
          )
        }
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Paid at</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.paymentNumber}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(p.paidAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{p.supplierName}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.invoiceNumber}
                    </td>
                    <td className="px-3 py-2">{p.method}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatMoney(p.amountPaisa)}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No supplier payments yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  )
}
