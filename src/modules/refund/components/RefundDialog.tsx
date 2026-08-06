import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/money"
import { useAuth } from "@/providers/AuthProvider"

import { RefundError, RefundService } from "../RefundService"

export type RefundDialogTarget = {
  invoiceId: string
  customerName: string
  totalPaisa: number
  paymentMethod: string | null
}

export function RefundDialog({
  target,
  open,
  onOpenChange,
  onCompleted,
}: {
  target: RefundDialogTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted?: () => void
}) {
  const { userId, profile } = useAuth()
  const [reason, setReason] = useState("Customer return")
  const [restock, setRestock] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason("Customer return")
    setRestock(true)
    setError(null)
  }, [open, target?.invoiceId])

  if (!target) return null

  async function submit() {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      await RefundService.process({
        invoiceId: target.invoiceId,
        reason,
        restock,
        actorId: userId,
        storeId: profile?.storeId ?? null,
        method:
          target.paymentMethod === "UPI" || target.paymentMethod === "Cash"
            ? target.paymentMethod
            : "Cash",
      })
      onOpenChange(false)
      onCompleted?.()
    } catch (err) {
      setError(
        err instanceof RefundError
          ? err.message
          : "Could not process refund."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Refund sale</DialogTitle>
          <DialogDescription>
            Full refund for {target.invoiceId}. This cannot be undone from the
            POS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
            <p className="text-muted-foreground">Customer</p>
            <p className="font-medium">{target.customerName}</p>
            <p className="mt-2 text-muted-foreground">Amount</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(target.totalPaisa)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Customer return"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={restock}
              onChange={(event) => setRestock(event.target.checked)}
            />
            Restock matching inventory items when available
          </label>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Refunding…" : "Confirm refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
