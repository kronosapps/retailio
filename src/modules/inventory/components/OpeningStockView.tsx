import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InventoryError,
  InventoryService,
} from "@/modules/inventory"
import { ProductService } from "@/modules/products"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type DraftLine = {
  key: string
  sku: string
  quantity: string
  expiryDate: string
  batchCode: string
  notes: string
}

function newLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sku: "",
    quantity: "1",
    expiryDate: "",
    batchCode: "",
    notes: "",
  }
}

/**
 * Inventory → Opening Stock — initial on-hand with optional lot expiry.
 */
export function OpeningStockView() {
  const { userId, profile } = useAuth()
  const [lines, setLines] = useState<DraftLine[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const products = useMemo(
    () => ProductService.list().filter((p) => p.active),
    []
  )

  async function onPost() {
    setError(null)
    setDoneMsg(null)
    setBusy(true)
    try {
      let count = 0
      for (const line of lines) {
        const qty = Number(line.quantity)
        if (!line.sku || !Number.isFinite(qty) || qty <= 0) continue
        await InventoryService.addOpeningStock({
          sku: line.sku,
          quantity: qty,
          expiryDate: line.expiryDate || null,
          batchCode: line.batchCode || null,
          notes: line.notes || null,
          actorId: userId,
          actorName: profile?.displayName ?? profile?.username ?? null,
          storeId: profile?.storeId ?? null,
        })
        count += 1
      }
      if (!count) {
        throw new InventoryError(
          "VALIDATION",
          "Add at least one line with SKU and quantity."
        )
      }
      setDoneMsg(`Posted opening stock for ${count} line(s).`)
      setLines([newLine()])
    } catch (err) {
      setError(
        err instanceof InventoryError || err instanceof Error
          ? err.message
          : "Could not post opening stock."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Opening Stock</h2>
        <p className="text-sm text-muted-foreground">
          Seed on-hand quantities with optional best-before dates. Creates
          OPENING_STOCK movements and FEFO lots — use this once when starting
          a store or financial year, not for routine purchases (use GRN).
        </p>
      </div>

      <div className="space-y-2">
        {lines.map((line, idx) => (
          <div
            key={line.key}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_5rem_8rem_7rem_1fr_auto]"
          >
            <div className="space-y-1">
              <Label className="text-xs">SKU</Label>
              <select
                className={selectClass}
                value={line.sku}
                onChange={(e) => {
                  const sku = e.target.value
                  const product = products.find((p) => p.sku === sku)
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            sku,
                            expiryDate:
                              !l.expiryDate && product?.shelfLifeDays
                                ? ""
                                : l.expiryDate,
                          }
                        : l
                    )
                  )
                }}
              >
                <option value="">Select item…</option>
                {products.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Qty</Label>
              <Input
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx ? { ...l, quantity: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Best before</Label>
              <Input
                type="date"
                value={line.expiryDate}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx ? { ...l, expiryDate: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Batch</Label>
              <Input
                value={line.batchCode}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx ? { ...l, batchCode: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={line.notes}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, i) =>
                      i === idx ? { ...l, notes: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div className="flex items-end">
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
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus className="size-4" />
          Add line
        </Button>
        <Button type="button" disabled={busy} onClick={() => void onPost()}>
          {busy ? "Posting…" : "Post opening stock"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {doneMsg ? (
        <p className="text-sm text-emerald-700">{doneMsg}</p>
      ) : null}
    </div>
  )
}

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
)
