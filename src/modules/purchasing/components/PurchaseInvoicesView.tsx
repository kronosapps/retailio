import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { taxConfig } from "@/data/tax"
import { formatMoney, paisaToRupees } from "@/lib/money"
import { cn } from "@/lib/utils"
import { ProductService } from "@/modules/products"
import {
  SupplierInvoiceError,
  SupplierInvoiceService,
  SupplierPaymentError,
  SupplierPaymentService,
  type PurchaseInvoiceRecord,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"

type CreateMode = "grn" | "bill"

type BillLine = {
  key: string
  sku: string
  quantity: string
  unitCostRupees: string
  gstRate: string
}

function newBillLine(defaultGst: number): BillLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sku: "",
    quantity: "1",
    unitCostRupees: "",
    gstRate: String(defaultGst),
  }
}

/**
 * Purchasing → Purchase Invoices — bill GRNs or create bill-only AP.
 */
export function PurchaseInvoicesView() {
  const { userId } = useAuth()
  const [tick, setTick] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>("grn")
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState<PurchaseInvoiceRecord | null>(null)
  const [selectedGrnIds, setSelectedGrnIds] = useState<string[]>([])
  const [defaultGstRate, setDefaultGstRate] = useState(
    String(taxConfig.gst.percent || 0)
  )
  const [supplierId, setSupplierId] = useState("")
  const [billLines, setBillLines] = useState<BillLine[]>([
    newBillLine(taxConfig.gst.percent || 0),
  ])
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

  const suppliers = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: false })
  }, [tick])

  const products = useMemo(() => {
    void tick
    return ProductService.list().filter((p) => p.active)
  }, [tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    const gst = String(taxConfig.gst.percent || 0)
    setCreateMode(unbilled.length > 0 ? "grn" : "bill")
    setSelectedGrnIds(unbilled[0] ? [unbilled[0].id] : [])
    setDefaultGstRate(gst)
    setSupplierId(suppliers[0]?.id || "")
    setBillLines([newBillLine(taxConfig.gst.percent || 0)])
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
      if (createMode === "grn") {
        await SupplierInvoiceService.createFromGrns({
          goodsReceiptIds: selectedGrnIds,
          supplierBillNumber: supplierBillNumber || null,
          dueAt: dueAt || null,
          notes: notes || null,
          defaultGstRate: Number(defaultGstRate),
          actorId: userId,
          issueAndPost: postOnCreate,
        })
      } else {
        await SupplierInvoiceService.createBillOnly({
          supplierId,
          supplierBillNumber: supplierBillNumber || null,
          dueAt: dueAt || null,
          notes: notes || null,
          lines: billLines.map((l) => ({
            sku: l.sku,
            quantity: Number(l.quantity),
            unitCostRupees: Number(l.unitCostRupees),
            gstRate: l.gstRate.trim() ? Number(l.gstRate) : null,
          })),
          actorId: userId,
          issueAndPost: postOnCreate,
        })
      }
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

  const canCreate =
    createMode === "grn"
      ? selectedGrnIds.length > 0
      : Boolean(supplierId) &&
        billLines.some(
          (l) =>
            l.sku &&
            Number(l.quantity) > 0 &&
            Number.isFinite(Number(l.unitCostRupees))
        )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Purchase Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Bill posted goods receipts or create bill-only AP. Does not change
            stock for bill-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {suppliers.length === 0 ? (
            <Link
              to="/purchasing/suppliers"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Add a supplier first
            </Link>
          ) : (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              New invoice
            </Button>
          )}
        </div>
      </div>

      {unbilled.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unbilled posted GRNs. Use Bill only, or{" "}
          <Link
            to="/purchasing/goods-received"
            className="underline underline-offset-2"
          >
            receive goods
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
                        {inv.billDate} · Total {formatMoney(inv.totalPaisa)}
                        {(inv.gstPaisa || 0) > 0
                          ? ` · GST ${formatMoney(inv.gstPaisa)}`
                          : ""}{" "}
                        · Paid {formatMoney(inv.amountPaidPaisa)}
                        {(inv.amountCreditedPaisa || 0) > 0
                          ? ` · Credit ${formatMoney(inv.amountCreditedPaisa)}`
                          : ""}
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
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Bill date</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">GST</th>
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
                        {(inv.amountCreditedPaisa || 0) > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Credit {formatMoney(inv.amountCreditedPaisa)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{inv.supplierName}</td>
                      <td className="px-3 py-2 text-xs">{inv.billDate}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(inv.totalPaisa)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {(inv.gstPaisa || 0) > 0
                          ? formatMoney(inv.gstPaisa)
                          : "—"}
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
                      colSpan={8}
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
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl">
          <DialogHeader>
            <DialogTitle>New purchase invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={createMode === "grn" ? "default" : "outline"}
                disabled={unbilled.length === 0}
                onClick={() => setCreateMode("grn")}
              >
                From GRN
              </Button>
              <Button
                type="button"
                size="sm"
                variant={createMode === "bill" ? "default" : "outline"}
                onClick={() => setCreateMode("bill")}
              >
                Bill only
              </Button>
            </div>

            {createMode === "grn" ? (
              <>
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
                          <span className="font-mono text-xs">
                            {g.grnNumber}
                          </span>
                          {" — "}
                          {g.supplierName}
                          <span className="block text-xs text-muted-foreground">
                            {g.lines.length} lines ·{" "}
                            {g.lines.reduce((s, l) => s + l.quantity, 0)} qty
                          </span>
                        </span>
                      </label>
                    ))}
                    {unbilled.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No unbilled posted GRNs.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="default-gst">Default GST rate (%)</Label>
                  <Input
                    id="default-gst"
                    inputMode="decimal"
                    value={defaultGstRate}
                    onChange={(e) => setDefaultGstRate(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="bill-supplier">Supplier</Label>
                  <select
                    id="bill-supplier"
                    className={cn(
                      "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                    )}
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Lines</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setBillLines((prev) => [
                          ...prev,
                          newBillLine(Number(defaultGstRate) || 0),
                        ])
                      }
                    >
                      Add line
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {billLines.map((line, idx) => (
                      <div
                        key={line.key}
                        className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_0.6fr_0.7fr_0.6fr_auto]"
                      >
                        <select
                          className={cn(
                            "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                          )}
                          value={line.sku}
                          onChange={(e) => {
                            const sku = e.target.value
                            const product = products.find((p) => p.sku === sku)
                            setBillLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      sku,
                                      gstRate:
                                        product &&
                                        Number.isFinite(product.gstRate)
                                          ? String(product.gstRate)
                                          : l.gstRate,
                                    }
                                  : l
                              )
                            )
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
                          inputMode="decimal"
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) =>
                            setBillLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? { ...l, quantity: e.target.value }
                                  : l
                              )
                            )
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Cost ₹"
                          value={line.unitCostRupees}
                          onChange={(e) =>
                            setBillLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? { ...l, unitCostRupees: e.target.value }
                                  : l
                              )
                            )
                          }
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="GST %"
                          value={line.gstRate}
                          onChange={(e) =>
                            setBillLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? { ...l, gstRate: e.target.value }
                                  : l
                              )
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={billLines.length === 1}
                          onClick={() =>
                            setBillLines((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

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
              disabled={busy || !canCreate}
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
            <DialogTitle>Pay {paying?.invoiceNumber}</DialogTitle>
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
