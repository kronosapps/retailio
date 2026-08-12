import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useSearchParams } from "react-router-dom"
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
import { ProductService } from "@/modules/products"
import {
  PurchaseOrderError,
  PurchaseOrderService,
  remainingQty,
  type PurchaseOrderRecord,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type DraftLine = {
  key: string
  sku: string
  quantityOrdered: string
  unitCostRupees: string
  notes: string
}

function newLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sku: "",
    quantityOrdered: "1",
    unitCostRupees: "",
    notes: "",
  }
}

/**
 * Purchasing → Purchase Orders — draft / issue. Stock only via GRN.
 */
export function PurchaseOrdersView() {
  const { userId, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const poIdParam = (searchParams.get("poId") || "").trim()
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [expectedAt, setExpectedAt] = useState("")
  const [notes, setNotes] = useState("")
  const [issueOnCreate, setIssueOnCreate] = useState(true)
  const [lines, setLines] = useState<DraftLine[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [focusPoId, setFocusPoId] = useState<string | null>(poIdParam || null)

  useEffect(() => {
    if (poIdParam) setFocusPoId(poIdParam)
  }, [poIdParam])

  const suppliers = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: false })
  }, [tick])

  const products = useMemo(() => {
    void tick
    return ProductService.list().filter((p) => p.active)
  }, [tick])

  const orders = useMemo(() => {
    void tick
    const list = PurchaseOrderService.list()
    if (!focusPoId) return list
    return [...list].sort((a, b) => {
      if (a.id === focusPoId) return -1
      if (b.id === focusPoId) return 1
      return 0
    })
  }, [tick, focusPoId])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    setSupplierId(suppliers[0]?.id || "")
    setExpectedAt("")
    setNotes("")
    setIssueOnCreate(true)
    setLines([newLine()])
    setError(null)
    setOpen(true)
  }

  async function onCreate() {
    setError(null)
    setBusy(true)
    try {
      await PurchaseOrderService.create({
        supplierId,
        expectedAt: expectedAt || null,
        notes: notes || null,
        issue: issueOnCreate,
        lines: lines.map((l) => ({
          sku: l.sku,
          quantityOrdered: Number(l.quantityOrdered),
          unitCostRupees: l.unitCostRupees.trim()
            ? Number(l.unitCostRupees)
            : null,
          notes: l.notes || null,
        })),
        storeId: profile?.storeId ?? null,
        actorId: userId,
      })
      setOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseOrderError || err instanceof Error
          ? err.message
          : "Could not create purchase order."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onIssue(id: string) {
    setError(null)
    setActionId(id)
    try {
      await PurchaseOrderService.issue(id, userId)
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseOrderError || err instanceof Error
          ? err.message
          : "Could not issue purchase order."
      )
    } finally {
      setActionId(null)
    }
  }

  async function onCancel(id: string) {
    setError(null)
    setActionId(id)
    try {
      await PurchaseOrderService.cancel(id, userId)
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseOrderError || err instanceof Error
          ? err.message
          : "Could not cancel purchase order."
      )
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">
            Issue orders to suppliers. Stock increases only when you post a
            Goods Received note against the PO.
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
              New purchase order
            </Button>
          )}
        </div>
      </div>

      {error && !open ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <ResponsiveList
        cards={
          orders.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No purchase orders yet. Create and issue one, then receive goods
              against it.
            </p>
          ) : (
            orders.map((po) => (
              <PoCard
                key={po.id}
                po={po}
                highlighted={po.id === focusPoId}
                busy={actionId === po.id}
                onIssue={() => void onIssue(po.id)}
                onCancel={() => void onCancel(po.id)}
              />
            ))
          )
        }
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">PO</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <PoRow
                    key={po.id}
                    po={po}
                    highlighted={po.id === focusPoId}
                    busy={actionId === po.id}
                    onIssue={() => void onIssue(po.id)}
                    onCancel={() => void onCancel(po.id)}
                  />
                ))}
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No purchase orders yet. Create and issue one, then receive
                      goods against it.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="po-supplier">Supplier</Label>
              <select
                id="po-supplier"
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

            <div className="space-y-1">
              <Label htmlFor="po-expected">Expected date</Label>
              <Input
                id="po-expected"
                type="date"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lines</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  Add line
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div
                    key={line.key}
                    className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_auto]"
                  >
                    <select
                      className={cn(
                        "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      )}
                      value={line.sku}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, sku: e.target.value } : l
                          )
                        )
                      }
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
                      value={line.quantityOrdered}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, quantityOrdered: e.target.value }
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
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, unitCostRupees: e.target.value }
                              : l
                          )
                        )
                      }
                    />
                    <Input
                      placeholder="Line notes"
                      value={line.notes}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, notes: e.target.value } : l
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="po-notes">Notes</Label>
              <Input
                id="po-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional order notes"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={issueOnCreate}
                onChange={(e) => setIssueOnCreate(e.target.checked)}
              />
              Issue immediately (required before receiving goods)
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <p className="text-xs text-muted-foreground">
              Creating a PO does not change stock. Receive against this order
              from Goods Received.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !supplierId}
              onClick={() => void onCreate()}
            >
              {busy
                ? "Saving…"
                : issueOnCreate
                  ? "Create & issue"
                  : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function poTotals(po: PurchaseOrderRecord) {
  const ordered = po.lines.reduce((s, l) => s + l.quantityOrdered, 0)
  const received = po.lines.reduce((s, l) => s + l.quantityReceived, 0)
  const remaining = po.lines.reduce((s, l) => s + remainingQty(l), 0)
  const canIssue = po.status === "DRAFT"
  const canCancel =
    po.status === "DRAFT" || po.status === "ISSUED" || po.status === "PARTIAL"
  return { ordered, received, remaining, canIssue, canCancel }
}

function statusBadgeClass(status: PurchaseOrderRecord["status"]) {
  return cn(
    "rounded px-1.5 py-0.5 text-xs font-medium",
    status === "RECEIVED"
      ? "bg-emerald-100 text-emerald-900"
      : status === "PARTIAL" || status === "ISSUED"
        ? "bg-sky-100 text-sky-900"
        : status === "CANCELLED"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-100 text-amber-900"
  )
}

function PoCard({
  po,
  busy,
  highlighted,
  onIssue,
  onCancel,
}: {
  po: PurchaseOrderRecord
  busy: boolean
  highlighted?: boolean
  onIssue: () => void
  onCancel: () => void
}) {
  const { ordered, received, remaining, canIssue, canCancel } = poTotals(po)
  return (
    <div
      className={cn(
        highlighted && "rounded-xl ring-2 ring-sky-400/70 ring-offset-2"
      )}
    >
    <MobileListCard
      title={po.poNumber}
      meta={
        <>
          <div>{po.supplierName}</div>
          <div>
            Ordered {ordered} · Received {received} · Remaining {remaining}
          </div>
        </>
      }
      badge={<span className={statusBadgeClass(po.status)}>{po.status}</span>}
      actions={
        <>
          {canIssue ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-10"
              disabled={busy}
              onClick={onIssue}
            >
              Issue
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-10"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          {(po.status === "ISSUED" || po.status === "PARTIAL") &&
          remaining > 0 ? (
            <Link
              to="/purchasing/goods-received"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-10"
              )}
            >
              Receive
            </Link>
          ) : null}
        </>
      }
    />
    </div>
  )
}

function PoRow({
  po,
  busy,
  highlighted,
  onIssue,
  onCancel,
}: {
  po: PurchaseOrderRecord
  busy: boolean
  highlighted?: boolean
  onIssue: () => void
  onCancel: () => void
}) {
  const { ordered, received, remaining, canIssue, canCancel } = poTotals(po)

  return (
    <tr
      className={cn(
        "border-b last:border-0",
        highlighted && "bg-sky-50 dark:bg-sky-950/30"
      )}
    >
      <td className="px-3 py-2 font-mono text-xs">{po.poNumber}</td>
      <td className="px-3 py-2">{po.supplierName}</td>
      <td className="px-3 py-2">
        <span className={statusBadgeClass(po.status)}>{po.status}</span>
      </td>
      <td className="px-3 py-2 tabular-nums">{ordered}</td>
      <td className="px-3 py-2 tabular-nums">{received}</td>
      <td className="px-3 py-2 tabular-nums">{remaining}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {canIssue ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onIssue}
            >
              Issue
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          {(po.status === "ISSUED" || po.status === "PARTIAL") &&
          remaining > 0 ? (
            <Link
              to="/purchasing/goods-received"
              className={buttonVariants({ variant: "link", size: "sm" })}
            >
              Receive
            </Link>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
