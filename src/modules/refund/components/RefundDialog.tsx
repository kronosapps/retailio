import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

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
import {
  SalesReturnError,
  SalesReturnService,
} from "@/modules/salesReturn"
import { invoiceRepository } from "@/repositories/InvoiceRepository"

export type RefundDialogTarget = {
  invoiceId: string
  customerName: string
  totalPaisa: number
  paymentMethod: string | null
}

/**
 * Quick full-return + refund. Partial / credit / exchange → /returns.
 */
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
      const sale = await invoiceRepository.getById(target.invoiceId)
      if (!sale) throw new SalesReturnError("NOT_FOUND", "Invoice not found.")
      const remaining = SalesReturnService.remainingReturnable(sale)
      const lines = remaining
        .filter((r) => r.remainingQty > 0)
        .map((r) => ({
          itemId: r.itemId,
          sku: r.sku,
          quantity: r.remainingQty,
        }))
      if (!lines.length) {
        throw new SalesReturnError(
          "VALIDATION",
          "Nothing left to return on this invoice."
        )
      }
      await SalesReturnService.create({
        invoiceId: target.invoiceId,
        settlement: "REFUND",
        lines,
        reason,
        restock,
        refundMethod:
          target.paymentMethod === "UPI" || target.paymentMethod === "Cash"
            ? target.paymentMethod
            : "Cash",
        actorId: userId,
        storeId: profile?.storeId ?? null,
      })
      onOpenChange(false)
      onCompleted?.()
    } catch (err) {
      setError(
        err instanceof SalesReturnError || err instanceof Error
          ? err.message
          : "Could not process return."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Full return + refund</DialogTitle>
          <DialogDescription>
            Returns all remaining lines on {target.invoiceId} and refunds{" "}
            {formatMoney(target.totalPaisa)} to {target.customerName}. For
            partial returns, credit notes, or exchanges use{" "}
            <Link to="/returns" className="underline underline-offset-2">
              Returns
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="refund-reason">Reason</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
            />
            Restock inventory
          </label>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={submit}>
            {busy ? "Processing…" : "Post full return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
