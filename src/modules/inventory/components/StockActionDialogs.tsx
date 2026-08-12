import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

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
import {
  InventoryError,
  InventoryService,
} from "@/modules/inventory"
import { ProductService } from "@/modules/products"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

const addSchema = z.object({
  quantity: z.string().trim().min(1, "Quantity is required"),
  reason: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

const adjustSchema = z.object({
  mode: z.enum(["add", "remove"]),
  quantity: z.string().trim().min(1, "Quantity is required"),
  reason: z.enum([
    "Damaged",
    "Wastage",
    "Physical Count",
    "Correction",
    "Other",
  ]),
  notes: z.string().trim().optional(),
})

type AddValues = z.infer<typeof addSchema>
type AdjustValues = z.infer<typeof adjustSchema>

function parseQty(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new InventoryError("INVALID_QTY", "Enter a positive quantity.")
  }
  return n
}

type Props = {
  sku: string
  mode: "add" | "adjust"
  onClose: () => void
  onDone: () => void
}

export function StockActionDialogs({ sku, mode, onClose, onDone }: Props) {
  const { userId, profile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [adjustMode, setAdjustMode] = useState<"add" | "remove">("add")
  const product = ProductService.getById(sku)
  const current = InventoryService.getCurrentStock(sku)

  const addForm = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { quantity: "1", reason: "Purchase", reference: "", notes: "" },
  })

  const adjustForm = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      mode: "add",
      quantity: "1",
      reason: "Correction",
      notes: "",
    },
  })

  async function submitAdd(values: AddValues) {
    setError(null)
    try {
      // Prefer Purchasing → Goods Received for supplier purchases (GRN reference).
      // This dialog remains for quick/opening adjustments with a free-text reference.
      await InventoryService.addStock({
        sku,
        quantity: parseQty(values.quantity),
        type: "PURCHASE",
        reason: values.reason || "Purchase",
        referenceId: values.reference || null,
        notes: values.notes || null,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
        storeId: profile?.storeId ?? null,
      })
      onDone()
    } catch (err) {
      setError(
        err instanceof InventoryError ? err.message : "Could not add stock."
      )
    }
  }

  async function submitAdjust(values: AdjustValues) {
    setError(null)
    try {
      await InventoryService.adjustStock({
        sku,
        quantity: parseQty(values.quantity),
        mode: adjustMode,
        reason: values.reason,
        notes: values.notes || null,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
        storeId: profile?.storeId ?? null,
      })
      onDone()
    } catch (err) {
      setError(
        err instanceof InventoryError
          ? err.message
          : "Could not adjust stock."
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add stock" : "Adjust stock"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {product?.name || sku} · On hand: <strong>{current}</strong>
        </p>
        {mode === "add" ? (
          <p className="text-xs text-muted-foreground">
            For supplier purchases, prefer{" "}
            <Link
              to="/purchasing/goods-received"
              className="underline underline-offset-2"
              onClick={onClose}
            >
              Purchasing → Goods Received
            </Link>{" "}
            so stock is tied to a GRN.
          </p>
        ) : null}

        {mode === "add" ? (
          <form className="space-y-3" onSubmit={addForm.handleSubmit(submitAdd)}>
            <div className="space-y-1">
              <Label htmlFor="add-qty">Quantity</Label>
              <Input
                id="add-qty"
                type="number"
                step="1"
                {...addForm.register("quantity")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-reason">Reason / source</Label>
              <Input id="add-reason" {...addForm.register("reason")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-ref">Reference</Label>
              <Input id="add-ref" {...addForm.register("reference")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-notes">Notes</Label>
              <Input id="add-notes" {...addForm.register("notes")} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={addForm.formState.isSubmitting}>
                Confirm
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={adjustForm.handleSubmit(submitAdjust)}
          >
            <div className="flex gap-2">
              {(["add", "remove"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
                    adjustMode === m
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted"
                  )}
                  onClick={() => {
                    setAdjustMode(m)
                    adjustForm.setValue("mode", m)
                  }}
                >
                  {m === "add" ? "+ Add" : "− Remove"}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-qty">Quantity</Label>
              <Input
                id="adj-qty"
                type="number"
                step="1"
                {...adjustForm.register("quantity")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-reason">Reason</Label>
              <select
                id="adj-reason"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                {...adjustForm.register("reason")}
              >
                <option value="Damaged">Damaged</option>
                <option value="Wastage">Wastage</option>
                <option value="Physical Count">Physical Count</option>
                <option value="Correction">Correction</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-notes">Notes</Label>
              <Input id="adj-notes" {...adjustForm.register("notes")} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adjustForm.formState.isSubmitting}
              >
                Confirm adjustment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
