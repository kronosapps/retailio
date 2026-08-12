import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { taxConfig } from "@/data/tax"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { ProductService } from "@/modules/products"
import {
  QuickPurchaseError,
  QuickPurchaseService,
  type QuickPurchaseResult,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"

type DraftLine = {
  key: string
  sku: string
  quantity: string
  unitCostRupees: string
  gstRate: string
}

function newLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sku: "",
    quantity: "1",
    unitCostRupees: "",
    gstRate: "",
  }
}

/**
 * Purchasing → Quick buy — GRN + posted invoice (+ optional payment) in one step.
 */
export function QuickPurchaseView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [supplierId, setSupplierId] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([newLine()])
  const [supplierBillNumber, setSupplierBillNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [defaultGstRate, setDefaultGstRate] = useState(
    String(taxConfig.gst.percent || 0)
  )
  const [payNow, setPayNow] = useState(false)
  const [payMethod, setPayMethod] = useState<"Cash" | "UPI">("Cash")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<QuickPurchaseResult | null>(null)

  const suppliers = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: false })
  }, [tick])

  const products = useMemo(() => {
    void tick
    return ProductService.list().filter((p) => p.active)
  }, [tick])

  useEffect(() => {
    if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id)
  }, [suppliers, supplierId])

  function resetForm() {
    setLines([newLine()])
    setSupplierBillNumber("")
    setNotes("")
    setDefaultGstRate(String(taxConfig.gst.percent || 0))
    setPayNow(false)
    setPayMethod("Cash")
    setError(null)
    setResult(null)
    setTick((t) => t + 1)
  }

  async function onSubmit() {
    setError(null)
    setBusy(true)
    try {
      const out = await QuickPurchaseService.execute({
        supplierId,
        lines: lines.map((l) => ({
          sku: l.sku,
          quantity: Number(l.quantity),
          unitCostRupees: Number(l.unitCostRupees),
          gstRate: l.gstRate.trim() ? Number(l.gstRate) : null,
        })),
        supplierBillNumber: supplierBillNumber || null,
        notes: notes || null,
        defaultGstRate: Number(defaultGstRate),
        pay: payNow ? { method: payMethod } : null,
        storeId: profile?.storeId ?? null,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      setResult(out)
      setTick((t) => t + 1)
    } catch (err) {
      setError(
        err instanceof QuickPurchaseError || err instanceof Error
          ? err.message
          : "Could not complete quick purchase."
      )
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    Boolean(supplierId) &&
    lines.some(
      (l) =>
        l.sku &&
        Number(l.quantity) > 0 &&
        Number.isFinite(Number(l.unitCostRupees))
    )

  if (result) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Quick buy complete</h2>
          <p className="text-sm text-muted-foreground">
            Stock, AP, and optional payment were recorded.
          </p>
        </div>
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <div>
            <span className="text-muted-foreground">GRN</span>{" "}
            <span className="font-mono">{result.grn.grnNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Invoice</span>{" "}
            <span className="font-mono">{result.invoice.invoiceNumber}</span>
            {" · "}
            {formatMoney(result.invoice.totalPaisa)}
            {(result.invoice.gstPaisa || 0) > 0
              ? ` (GST ${formatMoney(result.invoice.gstPaisa)})`
              : ""}
          </div>
          <div>
            <span className="text-muted-foreground">Payment</span>{" "}
            {result.payment ? (
              <>
                <span className="font-mono">
                  {result.payment.paymentNumber}
                </span>
                {" · "}
                {result.payment.method} · {formatMoney(result.payment.amountPaisa)}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <Button type="button" onClick={resetForm}>
          Another purchase
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Quick buy</h2>
          <p className="text-sm text-muted-foreground">
            Receive stock, post a purchase invoice, and optionally pay — in one
            step.
          </p>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Link
            to="/purchasing/suppliers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Add a supplier first
          </Link>
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="qb-supplier">Supplier</Label>
            <select
              id="qb-supplier"
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
                <Plus className="size-4" />
                Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_0.6fr_0.7fr_0.6fr_auto]"
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
                    inputMode="decimal"
                    placeholder="GST %"
                    value={line.gstRate}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, gstRate: e.target.value } : l
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="qb-bill">Vendor bill #</Label>
              <Input
                id="qb-bill"
                value={supplierBillNumber}
                onChange={(e) => setSupplierBillNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qb-gst">Default GST rate (%)</Label>
              <Input
                id="qb-gst"
                inputMode="decimal"
                value={defaultGstRate}
                onChange={(e) => setDefaultGstRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="qb-notes">Notes</Label>
            <Input
              id="qb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={payNow}
                onChange={(e) => setPayNow(e.target.checked)}
              />
              Pay now
            </label>
            {payNow ? (
              <select
                className={cn(
                  "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
                )}
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "Cash" | "UPI")
                }
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => void onSubmit()}
          >
            {busy ? "Working…" : "Receive, bill & continue"}
          </Button>
        </div>
      )}
    </div>
  )
}
