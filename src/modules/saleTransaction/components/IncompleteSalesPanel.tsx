import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { openPayment } from "@/modules/payment"
import {
  SALE_TXN_STATUS_LABELS,
  SaleTransactionService,
  type SaleTransactionRecord,
} from "@/modules/saleTransaction"
import { useAuth } from "@/providers/AuthProvider"

function formatWhen(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function statusTone(status: string) {
  if (status === "Failed") {
    return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-50"
  }
  if (
    status === "PaymentConfirmed" ||
    status === "InvoiceFinalized" ||
    status === "StockFinalized"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50"
  }
  return "border-border bg-muted/40 text-foreground"
}

/**
 * Incomplete POS sale transactions — resume pay / cancel unpaid / retry stock.
 */
export function IncompleteSalesPanel({
  onChanged,
}: {
  onChanged?: () => void
}) {
  const { profile, userId } = useAuth()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const rows = useMemo(() => {
    void tick
    return SaleTransactionService.listIncomplete(profile?.storeId ?? null)
  }, [tick, profile?.storeId])

  async function run(
    id: string,
    action: () => void | Promise<unknown>,
    ok: string
  ) {
    setBusyId(id)
    setMsg(null)
    try {
      await action()
      setMsg(ok)
      setTick((t) => t + 1)
      onChanged?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-4" />
            Incomplete sales
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explicit checkout boundaries — unpaid invoices leave stock intact;
            paid-but-stuck rows can retry stock.
          </p>
        </div>
        <span className="rounded-md border border-border px-2 py-1 text-xs tabular-nums">
          {rows.length} open
        </span>
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          No incomplete sale transactions.
        </p>
      ) : (
        <ResponsiveList
          cards={
            <>
              {rows.map((row) => (
                <SaleCard
                  key={row.id}
                  row={row}
                  busy={busyId === row.id}
                  onResume={() =>
                    void run(
                      row.id,
                      async () => {
                        if (!row.invoiceId) return
                        const payable =
                          await SaleTransactionService.resumePayment(
                            row.invoiceId
                          )
                        openPayment(payable)
                      },
                      "Payment dialog opened."
                    )
                  }
                  onCancel={() =>
                    void run(
                      row.id,
                      async () => {
                        if (!row.invoiceId) return
                        await SaleTransactionService.cancelUnpaid(
                          row.invoiceId
                        )
                      },
                      "Unpaid sale cancelled."
                    )
                  }
                  onRetryStock={() =>
                    void run(
                      row.id,
                      async () => {
                        if (!row.invoiceId) return
                        await SaleTransactionService.retryStock(
                          row.invoiceId,
                          userId
                        )
                      },
                      "Stock finalized."
                    )
                  }
                />
              ))}
            </>
          }
          table={
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {formatWhen(row.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            statusTone(row.status)
                          )}
                        >
                          {SALE_TXN_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.invoiceId || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.customerName || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.amountPaisa != null
                          ? formatMoney(row.amountPaisa)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <ActionButtons
                          row={row}
                          busy={busyId === row.id}
                          onResume={() =>
                            void run(
                              row.id,
                              async () => {
                                if (!row.invoiceId) return
                                const payable =
                                  await SaleTransactionService.resumePayment(
                                    row.invoiceId
                                  )
                                openPayment(payable)
                              },
                              "Payment dialog opened."
                            )
                          }
                          onCancel={() =>
                            void run(
                              row.id,
                              async () => {
                                if (!row.invoiceId) return
                                await SaleTransactionService.cancelUnpaid(
                                  row.invoiceId
                                )
                              },
                              "Unpaid sale cancelled."
                            )
                          }
                          onRetryStock={() =>
                            void run(
                              row.id,
                              async () => {
                                if (!row.invoiceId) return
                                await SaleTransactionService.retryStock(
                                  row.invoiceId,
                                  userId
                                )
                              },
                              "Stock finalized."
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </section>
  )
}

function ActionButtons({
  row,
  busy,
  onResume,
  onCancel,
  onRetryStock,
}: {
  row: SaleTransactionRecord
  busy: boolean
  onResume: () => void
  onCancel: () => void
  onRetryStock: () => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {SaleTransactionService.canResumePayment(row) ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onResume}
        >
          Resume pay
        </Button>
      ) : null}
      {SaleTransactionService.canRetryStock(row) ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onRetryStock}
        >
          Retry stock
        </Button>
      ) : null}
      {SaleTransactionService.canCancelUnpaid(row) ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel unpaid
        </Button>
      ) : null}
    </div>
  )
}

function SaleCard({
  row,
  busy,
  onResume,
  onCancel,
  onRetryStock,
}: {
  row: SaleTransactionRecord
  busy: boolean
  onResume: () => void
  onCancel: () => void
  onRetryStock: () => void
}) {
  return (
    <MobileListCard
      title={row.invoiceId || row.id}
      meta={
        <>
          <div>{formatWhen(row.updatedAt)}</div>
          <div>{row.customerName || "Walk-in"}</div>
          {row.failureReason ? (
            <div className="line-clamp-2 text-rose-700 dark:text-rose-300">
              {row.failureReason}
            </div>
          ) : null}
        </>
      }
      badge={
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
            statusTone(row.status)
          )}
        >
          {SALE_TXN_STATUS_LABELS[row.status]}
        </span>
      }
      actions={
        <ActionButtons
          row={row}
          busy={busy}
          onResume={onResume}
          onCancel={onCancel}
          onRetryStock={onRetryStock}
        />
      }
    />
  )
}
