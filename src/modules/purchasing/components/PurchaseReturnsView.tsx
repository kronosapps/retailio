import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Plus } from "lucide-react"

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
import { formatMoney, paisaToRupees } from "@/lib/money"
import {
  PurchaseReceivingService,
  PurchaseReturnError,
  PurchaseReturnService,
  SupplierInvoiceService,
  type PurchaseReturnRecord,
} from "@/modules/purchasing"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type DraftLine = {
  sku: string
  productName: string
  quantity: string
  maxQty: number
  unitCostRupees: string
}

/**
 * Purchasing → Returns — RTV / debit note against GRN or invoice.
 */
export function PurchaseReturnsView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"invoice" | "grn">("invoice")
  const [sourceId, setSourceId] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const returns = useMemo(() => {
    void tick
    return PurchaseReturnService.list()
  }, [tick])

  const invoices = useMemo(() => {
    void tick
    return PurchaseReturnService.listReturnableInvoices()
  }, [tick])

  const grns = useMemo(() => {
    void tick
    return PurchaseReturnService.listReturnableGrns()
  }, [tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    setError(null)
    setReason("")
    setNotes("")
    const preferInvoice = invoices.length > 0
    setMode(preferInvoice ? "invoice" : "grn")
    const firstId = preferInvoice
      ? invoices[0]?.id || ""
      : grns[0]?.id || ""
    setSourceId(firstId)
    setLines(linesFromSource(preferInvoice ? "invoice" : "grn", firstId))
    setOpen(true)
  }

  function linesFromSource(
    nextMode: "invoice" | "grn",
    id: string
  ): DraftLine[] {
    if (!id) return []
    if (nextMode === "invoice") {
      const inv = SupplierInvoiceService.getById(id)
      if (!inv) return []
      return PurchaseReturnService.remainingReturnableForInvoice(inv)
        .filter((l) => l.remainingQty > 0)
        .map((l) => ({
          sku: l.sku,
          productName: l.productName,
          quantity: String(l.remainingQty),
          maxQty: l.remainingQty,
          unitCostRupees: String(paisaToRupees(l.unitCostPaisa)),
        }))
    }
    const grn = PurchaseReceivingService.getById(id)
    if (!grn) return []
    return PurchaseReturnService.remainingReturnableForGrn(grn)
      .filter((l) => l.remainingQty > 0)
      .map((l) => ({
        sku: l.sku,
        productName: l.productName,
        quantity: String(l.remainingQty),
        maxQty: l.remainingQty,
        unitCostRupees:
          l.unitCostRupees != null ? String(l.unitCostRupees) : "",
      }))
  }

  function onSelectSource(nextMode: "invoice" | "grn", id: string) {
    setMode(nextMode)
    setSourceId(id)
    setLines(linesFromSource(nextMode, id))
  }

  async function onPost() {
    setError(null)
    setBusy(true)
    try {
      const mapped = lines
        .map((l) => ({
          sku: l.sku,
          quantity: Number(l.quantity),
          unitCostRupees: l.unitCostRupees.trim()
            ? Number(l.unitCostRupees)
            : null,
        }))
        .filter((l) => l.quantity > 0)

      await PurchaseReturnService.createAndPost({
        purchaseInvoiceId: mode === "invoice" ? sourceId : null,
        goodsReceiptId: mode === "grn" ? sourceId : null,
        lines: mapped,
        reason: reason || null,
        notes: notes || null,
        storeId: profile?.storeId ?? null,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      setOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseReturnError || err instanceof Error
          ? err.message
          : "Could not post purchase return."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onPostDraft(id: string) {
    setError(null)
    setBusy(true)
    try {
      await PurchaseReturnService.post(id, {
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseReturnError || err instanceof Error
          ? err.message
          : "Could not post return."
      )
    } finally {
      setBusy(false)
    }
  }

  const canPost = Boolean(sourceId) && lines.some((l) => Number(l.quantity) > 0)
  const hasSources = invoices.length > 0 || grns.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Purchase Returns</h2>
          <p className="text-sm text-muted-foreground">
            RTV / debit notes against a posted invoice or GRN. Posting removes
            stock (PURCHASE_RETURN) and credits AP when linked to an invoice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasSources ? (
            <Link
              to="/purchasing/goods-received"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Receive goods first
            </Link>
          ) : (
            <Button type="button" onClick={openCreate}>
              <Plus className="size-4" />
              New return
            </Button>
          )}
        </div>
      </div>

      <ResponsiveList
        cards={
          returns.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No purchase returns yet.
            </p>
          ) : (
            returns.map((ret) => (
              <MobileListCard
                key={ret.id}
                title={ret.returnNumber}
                meta={
                  <>
                    <div>{ret.supplierName}</div>
                    <div>
                      {ret.invoiceNumber
                        ? `Inv ${ret.invoiceNumber}`
                        : ret.grnNumber
                          ? `GRN ${ret.grnNumber}`
                          : "—"}{" "}
                      · {formatMoney(ret.totalPaisa)}
                    </div>
                  </>
                }
                badge={<StatusBadge status={ret.status} />}
                actions={
                  ret.status === "DRAFT" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-10"
                      disabled={busy}
                      onClick={() => void onPostDraft(ret.id)}
                    >
                      Post
                    </Button>
                  ) : null
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
                  <th className="px-3 py-2">Return</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No purchase returns yet.
                    </td>
                  </tr>
                ) : (
                  returns.map((ret) => (
                    <tr key={ret.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">
                        {ret.returnNumber}
                      </td>
                      <td className="px-3 py-2">{ret.supplierName}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {ret.invoiceNumber
                          ? `Inv ${ret.invoiceNumber}`
                          : ret.grnNumber
                            ? `GRN ${ret.grnNumber}`
                            : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(ret.totalPaisa)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={ret.status} />
                      </td>
                      <td className="px-3 py-2">
                        {ret.status === "DRAFT" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onPostDraft(ret.id)}
                          >
                            Post
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[100dvh] max-w-lg overflow-y-auto sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>New purchase return</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "invoice" ? "default" : "outline"}
                disabled={invoices.length === 0}
                onClick={() => {
                  const id = invoices[0]?.id || ""
                  onSelectSource("invoice", id)
                }}
              >
                Against invoice
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "grn" ? "default" : "outline"}
                disabled={grns.length === 0}
                onClick={() => {
                  const id = grns[0]?.id || ""
                  onSelectSource("grn", id)
                }}
              >
                Against GRN
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prn-source">
                {mode === "invoice" ? "Purchase invoice" : "Goods receipt"}
              </Label>
              <select
                id="prn-source"
                className={selectClass}
                value={sourceId}
                onChange={(e) => onSelectSource(mode, e.target.value)}
              >
                {(mode === "invoice" ? invoices : grns).map((row) => (
                  <option key={row.id} value={row.id}>
                    {"invoiceNumber" in row
                      ? `${row.invoiceNumber} · ${row.supplierName}`
                      : `${row.grnNumber} · ${row.supplierName}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prn-reason">Reason</Label>
              <Input
                id="prn-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Damaged, wrong item, excess…"
              />
            </div>

            <div className="space-y-2">
              <Label>Lines</Label>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing left to return on this document.
                </p>
              ) : (
                lines.map((l) => (
                  <div
                    key={l.sku}
                    className="grid grid-cols-[1fr_5rem_5rem] gap-2 rounded-md border p-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{l.sku}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.productName} · max {l.maxQty}
                      </div>
                    </div>
                    <Input
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.sku === l.sku
                              ? { ...row, quantity: e.target.value }
                              : row
                          )
                        )
                      }
                      aria-label={`Qty ${l.sku}`}
                    />
                    <Input
                      inputMode="decimal"
                      value={l.unitCostRupees}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.sku === l.sku
                              ? { ...row, unitCostRupees: e.target.value }
                              : row
                          )
                        )
                      }
                      aria-label={`Cost ${l.sku}`}
                      placeholder="₹"
                    />
                  </div>
                ))
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prn-notes">Notes</Label>
              <Input
                id="prn-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onPost()}
              disabled={!canPost || busy}
            >
              {busy ? "Posting…" : "Post return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusBadge({ status }: { status: PurchaseReturnRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        status === "POSTED" && "bg-emerald-100 text-emerald-800",
        status === "DRAFT" && "bg-amber-100 text-amber-900",
        status === "CANCELLED" && "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  )
}

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
)
