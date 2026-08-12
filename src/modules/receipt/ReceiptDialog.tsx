import { useEffect, useState } from "react"
import {
  CheckCircle2,
  MessageCircle,
  Printer,
  QrCode,
  Smartphone,
  X,
} from "lucide-react"
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
  type ReceiptContext,
} from "./buildReceipt"
import { printReceipt } from "./printReceipt"
import {
  getWhatsAppBusinessLabel,
  isBusinessWhatsAppConfigured,
  sendBusinessWhatsAppReceipt,
} from "./whatsappClient"

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
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [businessConfigured, setBusinessConfigured] = useState(() =>
    isBusinessWhatsAppConfigured()
  )

  useEffect(() => {
    if (!invoiceId) {
      setSale(null)
      setPayment(null)
      setPanel("menu")
      setSendMode("phone")
      setMobile("")
      setQrDataUrl(null)
      setError(null)
      setStatus(null)
      return
    }

    setSale(getRecordedSale(invoiceId))
    setPayment(getPaymentByInvoiceId(invoiceId))
    setPanel("menu")
    setSendMode("phone")
    setMobile("")
    setQrDataUrl(null)
    setError(null)
    setStatus(null)
    setBusinessConfigured(isBusinessWhatsAppConfigured())
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
          setError("Could not generate QR. Use mobile number instead.")
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

  async function handlePrint() {
    if (!ctx) return
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const ok = await printReceipt(ctx)
      if (!ok) {
        setError("Could not open the print dialog. Try again.")
      } else {
        setStatus("Print dialog opened — choose your printer.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleSendBusinessWhatsApp() {
    if (!ctx || !sale) return
    setError(null)
    setStatus(null)
    const phone = normalizeWhatsAppPhone(mobile)
    if (!phone) {
      setError("Enter a valid 10-digit customer mobile number.")
      return
    }

    setBusy(true)
    try {
      await sendBusinessWhatsAppReceipt({
        to: phone,
        message: buildReceiptText(ctx),
        invoiceId: sale.invoiceId,
      })
      setStatus(
        `Receipt queued via ${getWhatsAppBusinessLabel()} WhatsApp to +${phone}.`
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send receipt via company WhatsApp."
      )
    } finally {
      setBusy(false)
    }
  }

  function handleOpenDeviceWhatsApp() {
    if (!ctx) return
    setError(null)
    setStatus(null)
    const phone = normalizeWhatsAppPhone(mobile)
    if (!phone) {
      setError("Enter a valid 10-digit customer mobile number.")
      return
    }
    const url = buildWhatsAppReceiptUrl(buildReceiptText(ctx), phone)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (!open) return null

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 overflow-hidden rounded-none p-3 sm:h-[min(92vh,820px)] sm:max-w-lg sm:rounded-xl sm:p-4"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0">
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
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap sm:text-xs">
              {buildReceiptText(ctx)}
            </pre>
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Button
                type="button"
                size="lg"
                className="h-11 gap-2 sm:h-auto sm:flex-col sm:gap-1 sm:py-4"
                disabled={busy}
                onClick={() => void handlePrint()}
              >
                <Printer className="size-4 sm:size-5" />
                <span className="sm:hidden">{busy ? "Printing…" : "Print"}</span>
                <span className="hidden sm:inline">
                  {busy ? "Printing…" : "Print receipt"}
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="h-11 gap-2 sm:h-auto sm:flex-col sm:gap-1 sm:py-4"
                onClick={() => {
                  setPanel("send")
                  setError(null)
                  setStatus(null)
                  setBusinessConfigured(isBusinessWhatsAppConfigured())
                }}
              >
                <Smartphone className="size-4 sm:size-5" />
                <span className="sm:hidden">Phone</span>
                <span className="hidden sm:inline">Send to mobile</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {businessConfigured ? (
              <p className="shrink-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Sending as{" "}
                <span className="font-medium text-foreground">
                  {getWhatsAppBusinessLabel()}
                </span>{" "}
                (company WhatsApp). Customer receives the message — no app opens
                on this POS.
              </p>
            ) : (
              <p className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                Company WhatsApp is not configured yet. Add{" "}
                <code className="text-[10px]">VITE_WHATSAPP_WEBHOOK_URL</code>{" "}
                or set the webhook under Payment → merchant settings. Until then
                you can open WhatsApp on this device as a fallback.
              </p>
            )}

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setSendMode("phone")}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium",
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
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium",
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
              <div className="flex min-h-0 flex-1 flex-col gap-3">
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
                  />
                </div>
                {businessConfigured ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-full"
                    disabled={busy || mobile.replace(/\D/g, "").length < 10}
                    onClick={() => void handleSendBusinessWhatsApp()}
                  >
                    <MessageCircle data-icon="inline-start" />
                    {busy ? "Sending…" : "Send via company WhatsApp"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 w-full"
                    disabled={mobile.replace(/\D/g, "").length < 10}
                    onClick={handleOpenDeviceWhatsApp}
                  >
                    <MessageCircle data-icon="inline-start" />
                    Open WhatsApp on this device
                  </Button>
                )}
                {businessConfigured ? (
                  <button
                    type="button"
                    className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={handleOpenDeviceWhatsApp}
                  >
                    Or open WhatsApp on this device instead
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
                {busy && !qrDataUrl ? (
                  <p className="text-sm text-muted-foreground">
                    Generating QR…
                  </p>
                ) : null}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="WhatsApp receipt QR"
                    width={240}
                    height={240}
                    className="max-h-[min(50dvh,280px)] w-auto rounded-xl border border-border bg-white p-2"
                  />
                ) : null}
                <p className="max-w-sm text-center text-xs text-muted-foreground">
                  Customer scans to open WhatsApp with the receipt text. For
                  silent send from your business number, use Mobile number +
                  company WhatsApp webhook.
                </p>
              </div>
            )}

            <Separator className="shrink-0" />

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full shrink-0"
              onClick={() => {
                setPanel("menu")
                setError(null)
                setStatus(null)
              }}
            >
              Back to receipt options
            </Button>
          </div>
        )}

        {status ? (
          <p className="flex shrink-0 items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="shrink-0 text-sm text-destructive">{error}</p>
        ) : null}

        <DialogFooter className="shrink-0 sm:justify-end">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
