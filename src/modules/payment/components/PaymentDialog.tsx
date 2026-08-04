import { Copy, RefreshCw, Settings2 } from "lucide-react"

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
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

import { usePayment } from "../hooks/usePayment"
import type { PaymentMethod } from "../types"
import { copyText, formatCountdown, paymentMethodLabel } from "../utils"
import { PaymentQRCode } from "./PaymentQRCode"
import { PaymentStatus } from "./PaymentStatus"

const METHODS: PaymentMethod[] = [
  "UPI",
  "Cash",
  "Card",
  "BankTransfer",
  "SplitPayment",
]

export function PaymentDialog() {
  const {
    open,
    invoice,
    payment,
    method,
    setMethod,
    customerName,
    setCustomerName,
    remarks,
    setRemarks,
    qrDataUrl,
    error,
    busy,
    remainingSeconds,
    settings,
    showSettings,
    setShowSettings,
    persistSettings,
    regenerateQr,
    markPaid,
    cancelPayment,
    closePayment,
    canMarkPaid,
  } = usePayment()

  if (!open || !invoice) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (payment?.status === "Paid") closePayment()
          else void cancelPayment()
        }
      }}
    >
      <DialogContent
        className="max-h-[min(92vh,900px)] max-w-3xl overflow-y-auto sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg">Collect payment</DialogTitle>
              <DialogDescription>
                Invoice {invoice.invoiceNumber}
              </DialogDescription>
            </div>
            {payment ? <PaymentStatus status={payment.status} /> : null}
          </div>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-customer">Customer name</Label>
            <Input
              id="pay-customer"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Walk-in"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice amount</Label>
            <p className="flex h-9 items-center text-base font-semibold tabular-nums">
              {formatMoney(invoice.amountPaisa)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Payment method</Label>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((item) => (
              <button
                key={item}
                type="button"
                disabled={busy || payment?.status === "Paid"}
                onClick={() => void setMethod(item)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  method === item
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                {paymentMethodLabel(item)}
              </button>
            ))}
          </div>
        </div>

        {method === "SplitPayment" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pay-remarks">Split remarks</Label>
            <Input
              id="pay-remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="e.g. Cash 200 + UPI rest"
            />
          </div>
        ) : null}

        {method === "UPI" ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
              <PaymentQRCode dataUrl={qrDataUrl} size={260} />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatMoney(invoice.amountPaisa)}
                  </p>
                </div>
                <div className="grid gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Payment session</p>
                    <p className="truncate font-mono text-xs font-medium">
                      {payment?.paymentId || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Merchant</p>
                    <p className="font-medium">
                      {payment?.merchantName || settings.merchantName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">UPI ID</p>
                    <p className="truncate font-medium">
                      {payment?.merchantUPI || settings.merchantUpiId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Transaction reference
                    </p>
                    <p className="truncate font-mono text-xs font-medium">
                      {payment?.transactionReference || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Invoice</p>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!payment?.merchantUPI}
                    onClick={() =>
                      void copyText(payment?.merchantUPI || settings.merchantUpiId)
                    }
                  >
                    <Copy data-icon="inline-start" />
                    Copy UPI ID
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!payment?.transactionReference}
                    onClick={() =>
                      void copyText(payment?.transactionReference || "")
                    }
                  >
                    <Copy data-icon="inline-start" />
                    Copy TR
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void regenerateQr()}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Regenerate QR
                  </Button>
                </div>

                <p
                  className={cn(
                    "text-sm font-medium",
                    remainingSeconds !== null && remainingSeconds <= 60
                      ? "text-orange-700"
                      : "text-muted-foreground"
                  )}
                >
                  {payment?.status === "Expired"
                    ? "Session expired — regenerate to start a new payment session"
                    : remainingSeconds !== null
                      ? `Session expires in ${formatCountdown(remainingSeconds)}`
                      : null}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Collect {paymentMethodLabel(method)} for{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(invoice.amountPaisa)}
            </span>
            , then mark as paid.
          </div>
        )}

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <Separator />

        <div className="space-y-3">
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowSettings((value) => !value)}
          >
            <Settings2 className="size-3.5" />
            {showSettings ? "Hide merchant settings" : "Edit merchant settings"}
          </button>

          {showSettings ? (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="merchant-name">Merchant name</Label>
                <Input
                  id="merchant-name"
                  value={settings.merchantName}
                  onChange={(event) =>
                    persistSettings({ merchantName: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merchant-upi">Merchant UPI ID</Label>
                <Input
                  id="merchant-upi"
                  value={settings.merchantUpiId}
                  onChange={(event) =>
                    persistSettings({ merchantUpiId: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="merchant-mobile">Merchant mobile</Label>
                <Input
                  id="merchant-mobile"
                  value={settings.merchantMobile}
                  onChange={(event) =>
                    persistSettings({ merchantMobile: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-timeout">Timeout (minutes)</Label>
                <Input
                  id="pay-timeout"
                  type="number"
                  min={1}
                  max={60}
                  value={settings.paymentTimeoutMinutes}
                  onChange={(event) =>
                    persistSettings({
                      paymentTimeoutMinutes: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sheets-url">
                  Sheets webhook override (optional)
                </Label>
                <Input
                  id="sheets-url"
                  value={settings.sheetsWebhookUrl}
                  onChange={(event) =>
                    persistSettings({ sheetsWebhookUrl: event.target.value })
                  }
                  placeholder="Prefer VITE_GOOGLE_SCRIPT_URL in .env"
                />
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Sync goes through SyncManager (not this dialog). Prefer{" "}
                <code className="text-[10px]">VITE_GOOGLE_SCRIPT_URL</code>.
                After editing UPI, Regenerate QR. No secret API keys in source.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => void cancelPayment()}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-w-40"
            disabled={!canMarkPaid || busy}
            onClick={() => void markPaid()}
          >
            Mark as Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
