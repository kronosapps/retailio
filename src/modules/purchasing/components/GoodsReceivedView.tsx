import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"

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
  PurchaseReceivingError,
  PurchaseReceivingService,
  type GoodsReceiptRecord,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type DraftLine = {
  key: string
  sku: string
  quantity: string
  unitCostRupees: string
  notes: string
}

function newLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sku: "",
    quantity: "1",
    unitCostRupees: "",
    notes: "",
  }
}

/**
 * Purchasing → Goods Received — ad-hoc GRN posts stock via PurchaseReceivingService.
 */
export function GoodsReceivedView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const suppliers = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: false })
  }, [tick])

  const products = useMemo(() => {
    void tick
    return ProductService.list().filter((p) => p.active)
  }, [tick])

  const receipts = useMemo(() => {
    void tick
    return PurchaseReceivingService.list()
  }, [tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    setSupplierId(suppliers[0]?.id || "")
    setNotes("")
    setLines([newLine()])
    setError(null)
    setOpen(true)
  }

  async function onPost() {
    setError(null)
    setBusy(true)
    try {
      await PurchaseReceivingService.receiveAdHoc({
        supplierId,
        notes: notes || null,
        lines: lines.map((l) => ({
          sku: l.sku,
          quantity: Number(l.quantity),
          unitCostRupees: l.unitCostRupees.trim()
            ? Number(l.unitCostRupees)
            : null,
          notes: l.notes || null,
        })),
        storeId: profile?.storeId ?? null,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
        draftOnly: false,
      })
      setOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof PurchaseReceivingError || err instanceof Error
          ? err.message
          : "Could not post goods receipt."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Goods Received</h2>
          <p className="text-sm text-muted-foreground">
            Ad-hoc goods receipts increase stock through InventoryService
            (PURCHASE movements). Purchase orders come in a later phase.
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
              Receive goods
            </Button>
          )}
        </div>
      </div>

      {error && !open ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">GRN</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Lines</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">PO</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <GrnRow key={r.id} receipt={r} />
            ))}
            {receipts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No goods receipts yet. Receive against a supplier to stock in.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive goods (ad-hoc GRN)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="grn-supplier">Supplier</Label>
              <select
                id="grn-supplier"
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
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, quantity: e.target.value } : l
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
              <Label htmlFor="grn-notes">Notes</Label>
              <Input
                id="grn-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional receipt notes"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <p className="text-xs text-muted-foreground">
              Posting will create PURCHASE stock movements for each line
              (reference = GRN id). This cannot be undone from this screen.
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
              onClick={() => void onPost()}
            >
              {busy ? "Posting…" : "Post & stock in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GrnRow({ receipt }: { receipt: GoodsReceiptRecord }) {
  const qty = receipt.lines.reduce((s, l) => s + l.quantity, 0)
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 font-mono text-xs">{receipt.grnNumber}</td>
      <td className="px-3 py-2 text-xs">
        {new Date(receipt.receivedAt).toLocaleString()}
      </td>
      <td className="px-3 py-2">{receipt.supplierName}</td>
      <td className="px-3 py-2 tabular-nums">{receipt.lines.length}</td>
      <td className="px-3 py-2 tabular-nums">{qty}</td>
      <td className="px-3 py-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            receipt.status === "POSTED"
              ? "bg-emerald-100 text-emerald-900"
              : receipt.status === "CANCELLED"
                ? "bg-muted text-muted-foreground"
                : "bg-amber-100 text-amber-900"
          )}
        >
          {receipt.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {receipt.purchaseOrderId || "Ad-hoc"}
      </td>
    </tr>
  )
}
