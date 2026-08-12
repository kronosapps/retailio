import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney, paisaToRupees } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  SupplierInvoiceService,
  SupplierPaymentError,
  SupplierPaymentService,
  type PurchaseInvoiceRecord,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"

/**
 * Purchasing → Supplier Payments — settle open invoices + history.
 */
export function SupplierPaymentsView() {
  const { userId } = useAuth()
  const [tick, setTick] = useState(0)
  const [payOpen, setPayOpen] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [payMethod, setPayMethod] = useState<"Cash" | "UPI">("Cash")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const payments = useMemo(() => {
    void tick
    return SupplierPaymentService.list()
  }, [tick])

  const suppliers = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: false })
  }, [tick])

  const openInvoices = useMemo(() => {
    void tick
    if (!supplierId) return [] as PurchaseInvoiceRecord[]
    return SupplierInvoiceService.list()
      .filter(
        (inv) =>
          inv.supplierId === supplierId &&
          (inv.status === "POSTED" || inv.status === "PARTIAL") &&
          SupplierInvoiceService.remainingPayablePaisa(inv) > 0
      )
      .sort((a, b) => a.billDate.localeCompare(b.billDate))
  }, [tick, supplierId])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openPay() {
    const first = suppliers[0]?.id || ""
    setSupplierId(first)
    setPayMethod("Cash")
    setError(null)
    seedAmounts(first)
    setPayOpen(true)
  }

  function seedAmounts(sid: string) {
    const next: Record<string, string> = {}
    for (const inv of SupplierInvoiceService.list()) {
      if (
        inv.supplierId === sid &&
        (inv.status === "POSTED" || inv.status === "PARTIAL")
      ) {
        const rem = SupplierInvoiceService.remainingPayablePaisa(inv)
        if (rem > 0) next[inv.id] = String(paisaToRupees(rem))
      }
    }
    setAmounts(next)
  }

  function onSelectSupplier(sid: string) {
    setSupplierId(sid)
    seedAmounts(sid)
  }

  async function onPay() {
    setError(null)
    setBusy(true)
    try {
      const allocations = openInvoices
        .map((inv) => ({
          purchaseInvoiceId: inv.id,
          amountRupees: Number(amounts[inv.id] || 0),
        }))
        .filter((a) => Number.isFinite(a.amountRupees) && a.amountRupees > 0)

      await SupplierPaymentService.payInvoices({
        supplierId,
        method: payMethod,
        allocations,
        actorId: userId,
      })
      setPayOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof SupplierPaymentError || err instanceof Error
          ? err.message
          : "Could not record payment."
      )
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    Boolean(supplierId) &&
    openInvoices.some((inv) => Number(amounts[inv.id] || 0) > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Supplier Payments</h2>
          <p className="text-sm text-muted-foreground">
            Pay one or more open purchase invoices (Cash / UPI), or review
            payment history.
          </p>
        </div>
        <Button
          type="button"
          onClick={openPay}
          disabled={suppliers.length === 0}
        >
          <Plus className="size-4" />
          Pay supplier
        </Button>
      </div>

      {error && !payOpen ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

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
                      {(p.allocations?.length || 0) > 1
                        ? ` · ${p.allocations.length} invoices`
                        : ""}
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
                      {(p.allocations?.length || 0) > 1 ? (
                        <span className="ml-1 text-muted-foreground">
                          (+{p.allocations.length - 1})
                        </span>
                      ) : null}
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

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl">
          <DialogHeader>
            <DialogTitle>Pay supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pay-supplier">Supplier</Label>
              <select
                id="pay-supplier"
                className={cn(
                  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                )}
                value={supplierId}
                onChange={(e) => onSelectSupplier(e.target.value)}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Open invoices</Label>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {openInvoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No open POSTED / PARTIAL invoices for this supplier.
                  </p>
                ) : (
                  openInvoices.map((inv) => {
                    const remaining =
                      SupplierInvoiceService.remainingPayablePaisa(inv)
                    return (
                      <div
                        key={inv.id}
                        className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto]"
                      >
                        <div className="text-sm">
                          <div className="font-mono text-xs">
                            {inv.invoiceNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Remaining {formatMoney(remaining)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`alloc-${inv.id}`}
                            className="text-xs"
                          >
                            Amount ₹
                          </Label>
                          <Input
                            id={`alloc-${inv.id}`}
                            inputMode="decimal"
                            className="h-9 w-28"
                            value={amounts[inv.id] ?? ""}
                            onChange={(e) =>
                              setAmounts((prev) => ({
                                ...prev,
                                [inv.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                className={cn(
                  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                )}
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "Cash" | "UPI")
                }
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => void onPay()}
            >
              {busy ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
