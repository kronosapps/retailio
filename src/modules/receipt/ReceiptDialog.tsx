import { useEffect, useState } from "react"
import { MessageCircle, Printer, QrCode, Smartphone, X } from "lucide-react"
import QRCode from "qrcode"

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
import { getRecordedSale, type RecordedSale } from "@/data/invoices"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { Payment } from "@/modules/payment/types"
import { getPaymentByInvoiceId } from "@/modules/payment/store/paymentStore"

import {
  buildReceiptText,
  buildWhatsAppReceiptUrl,
  loadReceiptContext,
  normalizeWhatsAppPhone,
  printReceipt,
  type ReceiptContext,
} from "./buildReceipt"

type SendMode = "phone" | "qr"

type ReceiptDialogProps = {
  invoiceId: string | null
  onClose: () => void
}

export function ReceiptDialog({ invoiceId, onClose }: ReceiptDialogProps) {
  const open = Boolean(invoiceId)
  const [sale, setSale] = useState<RecordedSale | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [panel, setPanel] = useState<"menu" | "send">("menu")
  const [sendMode, setSendMode] = useState<SendMode>("phone")
  const [mobile, setMobile] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!invoiceId) {
      setSale(null)
      setPayment(null)
      setPanel("menu")
      setSendMode("phone")
      setMobile("")
      setQrDataUrl(null)
      setError(null)
      return
    }

    setSale(getRecordedSale(invoiceId))
    setPayment(getPaymentByInvoiceId(invoiceId))
    setPanel("menu")
    setSendMode("phone")
    setMobile("")
    setQrDataUrl(null)
    setError(null)
  }, [invoiceId])

  const ctx: ReceiptContext | null =
    sale != null ? loadReceiptContext(sale, payment) : null

  useEffect(() => {
    if (!sale || panel !== "send" || sendMode !== "qr") {
      setQrDataUrl(null)
      return
    }

    let cancelled = false
    setBusy(true)
    setError(null)

    const receiptCtx = loadReceiptContext(sale, payment)
    const text = buildReceiptText(receiptCtx)
    const url = buildWhatsAppReceiptUrl(text, null)

    void QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not generate WhatsApp QR. Try phone number instead.")
          setQrDataUrl(null)
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [sale, payment, panel, sendMode])

  function handlePrint() {
    if (!ctx) return
    setError(null)
    const ok = printReceipt(ctx)
    if (!ok) {
      setError("Pop-up blocked. Allow pop-ups to print the receipt.")
    }
  }

  function handleSendWhatsApp() {
    if (!ctx) return
    setError(null)
    const phone = normalizeWhatsAppPhone(mobile)
    if (!phone) {
      setError("Enter a valid 10-digit mobile number.")
      return
    }
    const text = buildReceiptText(ctx)
    const url = buildWhatsAppReceiptUrl(text, phone)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-md sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Receipt</DialogTitle>
              <DialogDescription>
                {sale
                  ? `Invoice ${sale.invoiceId} · ${formatMoney(sale.totals.total)}`
                  : "Preparing receipt…"}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close receipt"
            >
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        {!sale || !ctx ? (
          <p className="text-sm text-muted-foreground">
            Could not load this invoice for receipt.
          </p>
        ) : panel === "menu" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Payment recorded. Print a paper receipt or send it on WhatsApp.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                size="lg"
                className="h-auto flex-col gap-1 py-4"
                onClick={handlePrint}
              >
                <Printer className="size-5" />
                <span>Print receipt</span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="h-auto flex-col gap-1 py-4"
                onClick={() => {
                  setPanel("send")
                  setError(null)
                }}
              >
                <Smartphone className="size-5" />
                <span>Send to mobile</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSendMode("phone")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium",
                  sendMode === "phone"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                <MessageCircle className="size-3.5" />
                Mobile number
              </button>
              <button
                type="button"
                onClick={() => setSendMode("qr")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium",
                  sendMode === "qr"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                <QrCode className="size-3.5" />
                Customer QR
              </button>
            </div>

            {sendMode === "phone" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="receipt-mobile">Customer mobile</Label>
                  <Input
                    id="receipt-mobile"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="10-digit number"
                    value={mobile}
                    onChange={(e) =>
                      setMobile(e.target.value.replace(/\D/g, "").slice(0, 12))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleSendWhatsApp()
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Opens WhatsApp with the receipt message for this number.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={mobile.replace(/\D/g, "").length < 10}
                  onClick={handleSendWhatsApp}
                >
                  <MessageCircle data-icon="inline-start" />
                  Send on WhatsApp
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {busy && !qrDataUrl ? (
                  <p className="text-sm text-muted-foreground">
                    Generating WhatsApp QR…
                  </p>
                ) : null}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="WhatsApp receipt QR"
                    width={240}
                    height={240}
                    className="rounded-xl border border-border bg-white p-2"
                  />
                ) : null}
                <p className="max-w-sm text-center text-xs text-muted-foreground">
                  Customer scans this QR on their phone. WhatsApp opens with the
                  receipt ready to send or save.
                </p>
              </div>
            )}

            <Separator />

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setPanel("menu")
                setError(null)
              }}
            >
              Back to receipt options
            </Button>
          </div>
        )}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
