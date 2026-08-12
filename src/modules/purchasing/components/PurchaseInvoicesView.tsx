import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
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
import {
  SupplierInvoiceError,
  SupplierInvoiceService,
  SupplierPaymentError,
  SupplierPaymentService,
  type PurchaseInvoiceRecord,
} from "@/modules/purchasing"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

/**
 * Purchasing → Purchase Invoices — bill posted GRNs into AP.
 */
export function PurchaseInvoicesView() {
  const { userId } = useAuth()
  const [tick, setTick] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState<PurchaseInvoiceRecord | null>(null)
  const [selectedGrnIds, setSelectedGrnIds] = useState<string[]>([])
  const [supplierBillNumber, setSupplierBillNumber] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [notes, setNotes] = useState("")
  const [postOnCreate, setPostOnCreate] = useState(true)
  const [payAmount, setPayAmount] = useState("")
  const [payMethod, setPayMethod] = useState<"Cash" | "UPI">("Cash")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const invoices = useMemo(() => {
    void tick
    return SupplierInvoiceService.list()
  }, [tick])

  const unbilled = useMemo(() => {
    void tick
    return SupplierInvoiceService.listUnbilledPostedGrns()
  }, [tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    setSelectedGrnIds(unbilled[0] ? [unbilled[0].id] : [])
    setSupplierBillNumber("")
    setDueAt("")
    setNotes("")
    setPostOnCreate(true)
    setError(null)
    setCreateOpen(true)
  }

  function openPay(inv: PurchaseInvoiceRecord) {
    const remaining = SupplierInvoiceService.remainingPayablePaisa(inv)
    setPaying(inv)
    setPayAmount(String(paisaToRupees(remaining)))
    setPayMethod("Cash")
    setError(null)
    setPayOpen(true)
  }

  function toggleGrn(id: string) {
    setSelectedGrnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function onCreate() {
    setError(null)
    setBusy(true)
    try {
      await SupplierInvoiceService.createFromGrns({
        goodsReceiptIds: selectedGrnIds,
        supplierBillNumber: supplierBillNumber || null,
        dueAt: dueAt || null,
        notes: notes || null,
        actorId: userId,
        issueAndPost: postOnCreate,
      })
      setCreateOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof SupplierInvoiceError || err instanceof Error
          ? err.message
          : "Could not create purchase invoice."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onPost(id: string) {
    setError(null)
    setBusy(true)
    try {
      await SupplierInvoiceService.post(id, userId)
      refresh()
    } catch (err) {
      setError(
        err instanceof SupplierInvoiceError || err instanceof Error
          ? err.message
          : "Could not post invoice."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onPay() {
    if (!paying) return
    setError(null)
    setBusy(true)
    try {
      await SupplierPaymentService.payInvoice({
        purchaseInvoiceId: paying.id,
        amountRupees: Number(payAmount),
        method: payMethod,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Purchase Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Bill posted goods receipts to create Accounts Payable. Does not
            change stock.
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={unbilled.length === 0}
        >
          <Plus className="size-4" />
          New invoice
        </Button>
      </div>

      {unbilled.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unbilled posted GRNs.{" "}
          <Link
            to="/purchasing/goods-received"
            className="underline underline-offset-2"
          >
            Receive goods
          </Link>{" "}
          first (with unit costs).
        </p>
      ) : null}

      {error && !createOpen && !payOpen ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <ResponsiveList
        cards={
          invoices.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No purchase invoices yet.
            </p>
          ) : (
            invoices.map((inv) => {
              const remaining =
                SupplierInvoiceService.remainingPayablePaisa(inv)
              return (
                <MobileListCard
                  key={inv.id}
                  title={inv.invoiceNumber}
                  meta={
                    <>
                      <div>
                        {inv.supplierName}
                        {inv.supplierBillNumber
                          ? ` · Vendor ${inv.supplierBillNumber}`
                          : ""}
                      </div>
                      <div>
                        {inv.billDate} · Total {formatMoney(inv.totalPaisa)} ·
                        Paid {formatMoney(inv.amountPaidPaisa)}
                      </div>
                    </>
                  }
                  badge={<StatusBadge status={inv.status} />}
                  actions={
                    <>
                      {inv.status === "DRAFT" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          disabled={busy}
                          onClick={() => void onPost(inv.id)}
                        >
                          Post
                        </Button>
                      ) : null}
                      {(inv.status === "POSTED" || inv.status === "PARTIAL") &&
                      remaining > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-10"
                          disabled={busy}
                          onClick={() => openPay(inv)}
                        >
                          Pay
                        </Button>
                      ) : null}
                    </>
                  }
                />
              )
            })
          )
        }
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Bill date</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const remaining =
                    SupplierInvoiceService.remainingPayablePaisa(inv)
                  return (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">
                          {inv.invoiceNumber}
                        </div>
                        {inv.supplierBillNumber ? (
                          <div className="text-xs text-muted-foreground">
                            Vendor: {inv.supplierBillNumber}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{inv.supplierName}</td>
                      <td className="px-3 py-2 text-xs">{inv.billDate}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(inv.totalPaisa)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(inv.amountPaidPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {inv.status === "DRAFT" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void onPost(inv.id)}
                            >
                              Post
                            </Button>
                          ) : null}
                          {(inv.status === "POSTED" ||
                            inv.status === "PARTIAL") &&
                          remaining > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => openPay(inv)}
                            >
                              Pay
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {invoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No purchase invoices yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl">
          <DialogHeader>
            <DialogTitle>New purchase invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Unbilled GRNs</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {unbilled.map((g) => (
                  <label
                    key={g.id}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedGrnIds.includes(g.id)}
                      onChange={() => toggleGrn(g.id)}
                    />
                    <span>
                      <span className="font-mono text-xs">{g.grnNumber}</span>
                      {" — "}
                      {g.supplierName}
                      <span className="block text-xs text-muted-foreground">
                        {g.lines.length} lines ·{" "}
                        {g.lines.reduce((s, l) => s + l.quantity, 0)} qty
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="vendor-bill">Vendor bill #</Label>
              <Input
                id="vendor-bill"
                value={supplierBillNumber}
                onChange={(e) => setSupplierBillNumber(e.target.value)}
                placeholder="Optional supplier invoice number"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="due-at">Due date</Label>
              <Input
                id="due-at"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pin-notes">Notes</Label>
              <Input
                id="pin-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={postOnCreate}
                onChange={(e) => setPostOnCreate(e.target.checked)}
              />
              Post immediately (creates AP)
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || selectedGrnIds.length === 0}
              onClick={() => void onCreate()}
            >
              {busy ? "Saving…" : postOnCreate ? "Create & post" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-md md:rounded-xl">
          <DialogHeader>
            <DialogTitle>
              Pay {paying?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Remaining{" "}
              {paying
                ? formatMoney(
                    SupplierInvoiceService.remainingPayablePaisa(paying)
                  )
                : "—"}
            </p>
            <div className="space-y-1">
              <Label htmlFor="pay-amt">Amount (₹)</Label>
              <Input
                id="pay-amt"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
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
              disabled={busy}
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

function StatusBadge({ status }: { status: PurchaseInvoiceRecord["status"] }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        status === "PAID"
          ? "bg-emerald-100 text-emerald-900"
          : status === "PARTIAL" || status === "POSTED"
            ? "bg-sky-100 text-sky-900"
            : status === "CANCELLED"
              ? "bg-muted text-muted-foreground"
              : "bg-amber-100 text-amber-900"
      )}
    >
      {status}
    </span>
  )
}
