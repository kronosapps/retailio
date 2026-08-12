import { useMemo, useState } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { ProductService } from "@/modules/products"
import {
  SalesReturnError,
  SalesReturnService,
  type SalesReturnSettlement,
} from "@/modules/salesReturn"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import type { RecordedSale } from "@/data/invoices"
import { useAuth } from "@/providers/AuthProvider"

type QtyMap = Record<string, string>

/**
 * Sales returns, exchanges & credit notes — partial lines + settlement.
 */
export function ReturnsPage() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [invoiceId, setInvoiceId] = useState("")
  const [sale, setSale] = useState<RecordedSale | null>(null)
  const [settlement, setSettlement] =
    useState<SalesReturnSettlement>("REFUND")
  const [qtyMap, setQtyMap] = useState<QtyMap>({})
  const [reason, setReason] = useState("")
  const [refundMethod, setRefundMethod] = useState<"Cash" | "UPI">("Cash")
  const [exSku, setExSku] = useState("")
  const [exQty, setExQty] = useState("1")
  const [exPrice, setExPrice] = useState("")
  const [exchangeDraft, setExchangeDraft] = useState<
    Array<{
      itemId: string
      sku: string | null
      name: string
      quantity: number
      unitPriceRupees: number
    }>
  >([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const returns = useMemo(() => {
    void tick
    return SalesReturnService.list()
  }, [tick])

  const remaining = useMemo(() => {
    if (!sale) return []
    return SalesReturnService.remainingReturnable(sale)
  }, [sale, tick])

  const products = useMemo(
    () => ProductService.list().filter((p) => p.active),
    []
  )

  async function loadInvoice() {
    setError(null)
    setDoneMsg(null)
    const id = invoiceId.trim()
    if (!id) {
      setError("Enter an invoice id.")
      return
    }
    const found = await invoiceRepository.getById(id)
    if (!found) {
      setError("Invoice not found.")
      setSale(null)
      return
    }
    setSale(found)
    setRefundMethod(
      found.paymentMethod === "UPI" ? "UPI" : "Cash"
    )
    const rem = SalesReturnService.remainingReturnable(found)
    const next: QtyMap = {}
    for (const r of rem) {
      next[(r.sku || r.itemId).toUpperCase()] = ""
    }
    setQtyMap(next)
    setExchangeDraft([])
  }

  function addExchangeLine() {
    const product = products.find(
      (p) => p.sku.toUpperCase() === exSku.trim().toUpperCase()
    )
    if (!product) {
      setError("Select a product for exchange.")
      return
    }
    const qty = Number(exQty)
    const price =
      exPrice.trim() === ""
        ? product.sellingPrice
        : Number(exPrice)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Exchange qty must be positive.")
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Exchange price invalid.")
      return
    }
    setExchangeDraft((prev) => [
      ...prev,
      {
        itemId: product.sku,
        sku: product.sku,
        name: product.name,
        quantity: Math.floor(qty),
        unitPriceRupees: price,
      },
    ])
    setExSku("")
    setExQty("1")
    setExPrice("")
    setError(null)
  }

  async function onPost() {
    if (!sale) return
    setError(null)
    setDoneMsg(null)
    setBusy(true)
    try {
      const lines = remaining
        .map((r) => {
          const key = (r.sku || r.itemId).toUpperCase()
          return {
            itemId: r.itemId,
            sku: r.sku,
            quantity: Number(qtyMap[key] || 0),
          }
        })
        .filter((l) => l.quantity > 0)

      const posted = await SalesReturnService.create({
        invoiceId: sale.invoiceId,
        settlement,
        lines,
        exchangeLines:
          settlement === "EXCHANGE" ? exchangeDraft : undefined,
        reason: reason || null,
        restock: true,
        refundMethod,
        storeId: profile?.storeId ?? sale.storeId,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      setDoneMsg(
        `Posted ${posted.returnNumber} · ${posted.settlement} · ${formatMoney(posted.totalPaisa)}`
      )
      setSale(null)
      setInvoiceId("")
      setQtyMap({})
      setExchangeDraft([])
      setReason("")
      setTick((n) => n + 1)
    } catch (err) {
      setError(
        err instanceof SalesReturnError || err instanceof Error
          ? err.message
          : "Could not post return."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onCancelUnpaid() {
    if (!sale) return
    setError(null)
    setBusy(true)
    try {
      await SalesReturnService.cancelUnpaidSale({
        invoiceId: sale.invoiceId,
        reason: reason || "Cancelled sale",
        actorId: userId,
      })
      setDoneMsg(`Cancelled unpaid sale ${sale.invoiceId}`)
      setSale(null)
      setTick((n) => n + 1)
    } catch (err) {
      setError(
        err instanceof SalesReturnError || err instanceof Error
          ? err.message
          : "Could not cancel."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Returns & exchanges
        </h1>
        <p className="text-sm text-muted-foreground">
          Partial returns with refund, store credit, or exchange. Separate from
          the old full-invoice refund shortcut.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {doneMsg ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {doneMsg}
        </p>
      ) : null}

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <RotateCcw className="size-4 text-muted-foreground" />
          <h2 className="font-medium">Look up sale</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs font-mono"
            placeholder="INV-…"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={loadInvoice}>
            Load
          </Button>
        </div>
        {sale ? (
          <p className="text-sm text-muted-foreground">
            {sale.invoiceId} · {sale.customerName || "Walk-in"} ·{" "}
            {sale.paymentStatus} · {formatMoney(sale.totals.total)}
          </p>
        ) : null}
      </section>

      {sale ? (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["REFUND", "Refund"],
                ["CREDIT_NOTE", "Credit note"],
                ["EXCHANGE", "Exchange"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={settlement === id ? "default" : "outline"}
                onClick={() => setSettlement(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Left</th>
                  <th className="px-3 py-2 text-right">Return qty</th>
                </tr>
              </thead>
              <tbody>
                {remaining.map((r) => {
                  const key = (r.sku || r.itemId).toUpperCase()
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {key}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.soldQty}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.remainingQty}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          className="ml-auto h-8 w-20 text-right"
                          inputMode="numeric"
                          disabled={r.remainingQty <= 0}
                          value={qtyMap[key] || ""}
                          onChange={(e) =>
                            setQtyMap((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {settlement === "REFUND" || settlement === "EXCHANGE" ? (
            <div className="space-y-1">
              <Label>Refund method (cash out / exchange top-up)</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={refundMethod}
                onChange={(e) =>
                  setRefundMethod(e.target.value === "UPI" ? "UPI" : "Cash")
                }
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          ) : null}

          {settlement === "EXCHANGE" ? (
            <div className="space-y-3 rounded-md border p-3">
              <h3 className="text-sm font-medium">New merchandise</h3>
              <div className="grid gap-2 sm:grid-cols-[1.4fr_0.5fr_0.7fr_auto]">
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={exSku}
                  onChange={(e) => {
                    setExSku(e.target.value)
                    const p = products.find((x) => x.sku === e.target.value)
                    if (p) setExPrice(String(p.sellingPrice))
                  }}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="numeric"
                  value={exQty}
                  onChange={(e) => setExQty(e.target.value)}
                  placeholder="Qty"
                />
                <Input
                  inputMode="decimal"
                  value={exPrice}
                  onChange={(e) => setExPrice(e.target.value)}
                  placeholder="₹"
                />
                <Button type="button" variant="outline" onClick={addExchangeLine}>
                  Add
                </Button>
              </div>
              {exchangeDraft.length ? (
                <ul className="space-y-1 text-sm">
                  {exchangeDraft.map((l, i) => (
                    <li
                      key={`${l.sku}-${i}`}
                      className="flex justify-between gap-2"
                    >
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(
                          Math.round(l.unitPriceRupees * 100) * l.quantity
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Add at least one exchange product.
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged / wrong item / customer changed mind"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={onPost}>
              Post {settlement === "REFUND"
                ? "return + refund"
                : settlement === "CREDIT_NOTE"
                  ? "return + credit note"
                  : "exchange"}
            </Button>
            {sale.paymentStatus === "Pending" ||
            sale.paymentStatus === "Failed" ||
            sale.paymentStatus === "Expired" ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onCancelUnpaid}
              >
                Cancel unpaid sale
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Recent returns
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Return</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Settlement</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No sales returns yet.
                  </td>
                </tr>
              ) : (
                returns.slice(0, 40).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.returnNumber}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.invoiceId}
                    </td>
                    <td className="px-3 py-2">{r.settlement}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.totalPaisa)}
                      {r.settlement === "EXCHANGE" ? (
                        <span className="block text-xs text-muted-foreground">
                          net {formatMoney(r.netDeltaPaisa)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          r.status === "POSTED" && "text-emerald-700",
                          r.status === "DRAFT" && "text-muted-foreground"
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
