import { useMemo, useRef, useState } from "react"
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
import { isWalkInName } from "@/data/customers"
import {
  cashDueRupees,
  formatMoney,
  formatRupeesWhole,
} from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  CustomerService,
  type CustomerRecord,
} from "@/modules/customer"
import { useAuth } from "@/providers/AuthProvider"

import { useCashCounter } from "../hooks/useCashCounter"
import { usePayment } from "../hooks/usePayment"
import type { PaymentMethod } from "../types"
import {
  copyText,
  formatCountdown,
  normalizeUpiTxnLast4,
  paymentMethodLabel,
} from "../utils"
import { PaymentQRCode } from "./PaymentQRCode"
import { PaymentStatus } from "./PaymentStatus"

const METHODS: PaymentMethod[] = ["UPI", "Cash", "OnAccount"]
const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"] as const

export function PaymentDialog() {
  const paymentHook = usePayment()
  const { open, invoice } = paymentHook
  if (!open || !invoice) return null
  return (
    <PaymentDialogSession
      key={invoice.invoiceId}
      invoice={invoice}
      paymentHook={paymentHook}
    />
  )
}

type PaymentHook = ReturnType<typeof usePayment>

function PaymentDialogSession({
  invoice,
  paymentHook,
}: {
  invoice: NonNullable<PaymentHook["invoice"]>
  paymentHook: PaymentHook
}) {
  const { profile } = useAuth()
  const {
    payment,
    method,
    setMethod,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
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
  } = paymentHook

  const nextCash = useCashCounter()
  const storeId = profile?.storeId ?? null

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cashTenderOpen, setCashTenderOpen] = useState(false)
  const [upiLast4, setUpiLast4] = useState("")
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [cashReceivedDigits, setCashReceivedDigits] = useState("")
  const [nameSuggestions, setNameSuggestions] = useState<CustomerRecord[]>([])
  const [phoneSuggestions, setPhoneSuggestions] = useState<CustomerRecord[]>([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false)
  const [matchedCustomer, setMatchedCustomer] = useState<CustomerRecord | null>(
    null
  )
  const [applyStoreCredit, setApplyStoreCredit] = useState(false)
  const suggestBlurTimer = useRef<number | null>(null)

  const storeCreditAvailable = matchedCustomer?.storeCreditPaisa ?? 0
  const storeCreditAppliedPaisa = applyStoreCredit
    ? Math.min(storeCreditAvailable, invoice.amountPaisa)
    : 0

  const dueRupees = useMemo(
    () => cashDueRupees(Math.max(0, invoice.amountPaisa - storeCreditAppliedPaisa)),
    [invoice.amountPaisa, storeCreditAppliedPaisa]
  )

  const cashReceived = useMemo(() => {
    if (!cashReceivedDigits) return 0
    const n = Number.parseInt(cashReceivedDigits, 10)
    return Number.isFinite(n) ? n : 0
  }, [cashReceivedDigits])

  const cashChange = cashReceived - dueRupees
  const canCompleteCash =
    dueRupees === 0
      ? storeCreditAppliedPaisa >= invoice.amountPaisa
      : cashReceived >= dueRupees && dueRupees > 0

  function clearSuggestBlur() {
    if (suggestBlurTimer.current != null) {
      window.clearTimeout(suggestBlurTimer.current)
      suggestBlurTimer.current = null
    }
  }

  function scheduleHideSuggestions() {
    clearSuggestBlur()
    suggestBlurTimer.current = window.setTimeout(() => {
      setShowNameSuggestions(false)
      setShowPhoneSuggestions(false)
    }, 150)
  }

  function applyCustomer(customer: CustomerRecord) {
    setCustomerName(customer.name)
    setCustomerPhone(customer.phone || "")
    setMatchedCustomer(customer)
    setApplyStoreCredit(customer.storeCreditPaisa > 0)
    setNameSuggestions([])
    setPhoneSuggestions([])
    setShowNameSuggestions(false)
    setShowPhoneSuggestions(false)
  }

  function onCustomerNameChange(value: string) {
    setCustomerName(value)
    setMatchedCustomer(null)
    setApplyStoreCredit(false)
    if (isWalkInName(value) || value.trim().length < 1) {
      setNameSuggestions([])
      setShowNameSuggestions(false)
      return
    }
    const hits = CustomerService.search(value, storeId)
    setNameSuggestions(hits)
    setShowNameSuggestions(hits.length > 0)
  }

  function onCustomerPhoneChange(value: string) {
    const cleaned = value.replace(/[^\d+\s-]/g, "").slice(0, 16)
    setCustomerPhone(cleaned)
    setMatchedCustomer(null)
    setApplyStoreCredit(false)
    const digits = cleaned.replace(/\D/g, "")
    if (digits.length < 3) {
      setPhoneSuggestions([])
      setShowPhoneSuggestions(false)
      return
    }
    const hits = CustomerService.search(digits, storeId)
    setPhoneSuggestions(hits)
    setShowPhoneSuggestions(hits.length > 0)

    // Exact phone match → autofill name immediately
    const exact = CustomerService.findByPhone(digits, storeId)
    if (exact && digits.length >= 10) {
      setCustomerName(exact.name)
      setCustomerPhone(exact.phone || cleaned)
      setMatchedCustomer(exact)
      setApplyStoreCredit(exact.storeCreditPaisa > 0)
      setShowPhoneSuggestions(false)
    }
  }

  function openUpiConfirm() {
    setUpiLast4("")
    setConfirmError(null)
    setConfirmOpen(true)
  }

  function openCashTender() {
    setCashReceivedDigits("")
    setConfirmError(null)
    setCashTenderOpen(true)
  }

  function closeConfirm() {
    if (busy) return
    setConfirmOpen(false)
    setUpiLast4("")
    setConfirmError(null)
  }

  function closeCashTender() {
    if (busy) return
    setCashTenderOpen(false)
    setCashReceivedDigits("")
    setConfirmError(null)
  }

  function pressKeypad(key: (typeof KEYPAD)[number]) {
    if (key === "⌫") {
      setCashReceivedDigits((prev) => prev.slice(0, -1))
      return
    }
    setCashReceivedDigits((prev) => {
      const next = `${prev}${key}`.replace(/^0+(?=\d)/, "")
      return next.slice(0, 8)
    })
  }

  async function submitUpiConfirm() {
    setConfirmError(null)
    const last4 = normalizeUpiTxnLast4(upiLast4)
    if (!last4) {
      setConfirmError("Enter exactly 4 digits from the UPI transaction ID.")
      return
    }
    await markPaid({
      method: "UPI",
      upiTxnLast4: last4,
      storeCreditAppliedPaisa,
    })
    setConfirmOpen(false)
    setUpiLast4("")
  }

  async function submitCashPaid() {
    setConfirmError(null)
    if (!canCompleteCash) {
      setConfirmError("Cash received must cover the amount due.")
      return
    }
    await markPaid({ method: "Cash", storeCreditAppliedPaisa })
    setCashTenderOpen(false)
    setCashReceivedDigits("")
  }

  function onPrimaryAction() {
    if (dueRupees === 0 && storeCreditAppliedPaisa > 0) {
      void markPaid({ method: "Cash", storeCreditAppliedPaisa })
      return
    }
    if (method === "OnAccount") {
      void markPaid({ method: "OnAccount", storeCreditAppliedPaisa })
      return
    }
    if (method === "Cash") openCashTender()
    else openUpiConfirm()
  }

  return (
    <>
      <Dialog
        open
        disablePointerDismissal
        onOpenChange={(next) => {
          if (!next) {
            if (payment?.status === "Paid") closePayment()
            else void cancelPayment()
          }
        }}
      >
        <DialogContent
          className="h-[100dvh] max-h-[100dvh] w-full max-w-full gap-4 overflow-y-auto rounded-none p-4 sm:h-auto sm:max-h-[min(92vh,900px)] sm:max-w-3xl sm:rounded-xl sm:p-6"
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative space-y-1.5">
              <Label htmlFor="pay-customer">Customer name</Label>
              <Input
                id="pay-customer"
                value={customerName}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                onFocus={() => {
                  clearSuggestBlur()
                  if (nameSuggestions.length > 0) setShowNameSuggestions(true)
                }}
                onBlur={scheduleHideSuggestions}
                placeholder="Walk-in"
                autoComplete="off"
              />
              {showNameSuggestions && nameSuggestions.length > 0 ? (
                <SuggestionList
                  items={nameSuggestions}
                  onSelect={applyCustomer}
                />
              ) : null}
            </div>
            <div className="relative space-y-1.5">
              <Label htmlFor="pay-phone">Mobile (optional)</Label>
              <Input
                id="pay-phone"
                inputMode="tel"
                autoComplete="tel"
                value={customerPhone}
                onChange={(event) => onCustomerPhoneChange(event.target.value)}
                onFocus={() => {
                  clearSuggestBlur()
                  if (phoneSuggestions.length > 0) setShowPhoneSuggestions(true)
                }}
                onBlur={scheduleHideSuggestions}
                placeholder="10-digit mobile"
              />
              {showPhoneSuggestions && phoneSuggestions.length > 0 ? (
                <SuggestionList
                  items={phoneSuggestions}
                  onSelect={applyCustomer}
                />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Invoice amount</Label>
              <p className="flex h-9 items-center text-base font-semibold tabular-nums">
                {formatMoney(invoice.amountPaisa)}
              </p>
            </div>
          </div>

          {storeCreditAvailable > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyStoreCredit}
                  onChange={(e) => setApplyStoreCredit(e.target.checked)}
                  disabled={busy || payment?.status === "Paid"}
                />
                <span>
                  Apply store credit (available{" "}
                  {formatMoney(storeCreditAvailable)})
                </span>
              </label>
              {storeCreditAppliedPaisa > 0 ? (
                <span className="tabular-nums text-muted-foreground">
                  Due {formatMoney(invoice.amountPaisa - storeCreditAppliedPaisa)}
                </span>
              ) : null}
            </div>
          ) : null}

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
                    "min-h-11 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
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

          {method === "UPI" ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start">
                <div className="sm:hidden">
                  <PaymentQRCode dataUrl={qrDataUrl} size={180} />
                </div>
                <div className="hidden sm:block">
                  <PaymentQRCode dataUrl={qrDataUrl} size={260} />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatMoney(invoice.amountPaisa)}
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Payment session
                      </p>
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
                        void copyText(
                          payment?.merchantUPI || settings.merchantUpiId
                        )
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
            <div className="space-y-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              <p>
                Collect cash for{" "}
                <span className="font-semibold text-foreground">
                  {formatRupeesWhole(dueRupees)}
                </span>{" "}
                (rounded), then enter amount received.
              </p>
              <p className="text-xs">
                Next cash slip today:{" "}
                <span className="font-mono font-medium text-foreground">
                  #{nextCash.sequence}
                </span>{" "}
                ({nextCash.cashReceiptId})
              </p>
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
                <div className="space-y-1.5">
                  <Label htmlFor="wa-business-name">
                    WhatsApp business name
                  </Label>
                  <Input
                    id="wa-business-name"
                    value={settings.whatsappBusinessName}
                    onChange={(event) =>
                      persistSettings({
                        whatsappBusinessName: event.target.value,
                      })
                    }
                    placeholder="e.g. Pavani's Foods"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-webhook">WhatsApp send webhook</Label>
                  <Input
                    id="wa-webhook"
                    value={settings.whatsappWebhookUrl}
                    onChange={(event) =>
                      persistSettings({
                        whatsappWebhookUrl: event.target.value,
                      })
                    }
                    placeholder="Prefer VITE_WHATSAPP_WEBHOOK_URL in .env"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground sm:col-span-2">
                  Company WhatsApp needs a Business API / BSP webhook — see{" "}
                  <code className="text-[10px]">docs/WHATSAPP_RECEIPTS.md</code>
                  . Never paste Meta API tokens into the browser app.
                </p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void cancelPayment()}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              className="min-h-12 min-w-40"
              disabled={!canMarkPaid || busy}
              onClick={onPrimaryAction}
            >
              {method === "Cash"
                ? "Collect Cash"
                : method === "OnAccount"
                  ? "Charge on account"
                  : "Mark as Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UPI confirm */}
      <Dialog
        open={confirmOpen}
        disablePointerDismissal
        onOpenChange={(next) => {
          if (!next) closeConfirm()
        }}
      >
        <DialogContent
          className="h-[100dvh] max-h-[100dvh] w-full max-w-full rounded-none p-4 sm:h-auto sm:max-h-[min(92vh,900px)] sm:max-w-md sm:rounded-xl sm:p-6"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>Confirm UPI payment</DialogTitle>
            <DialogDescription>
              Ask the customer for the last 4 digits of the UPI transaction ID
              on their phone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="upi-last4">Last 4 digits of transaction ID</Label>
            <Input
              id="upi-last4"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={4}
              placeholder="e.g. 4821"
              value={upiLast4}
              onChange={(event) =>
                setUpiLast4(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void submitUpiConfirm()
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Used later to tally UPI settlements. Exactly 4 digits.
            </p>
          </div>

          {confirmError ? (
            <p className="text-sm text-destructive">{confirmError}</p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={closeConfirm}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || upiLast4.length !== 4}
              onClick={() => void submitUpiConfirm()}
            >
              {busy ? "Saving…" : "Confirm & complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash tender + change */}
      <Dialog
        open={cashTenderOpen}
        disablePointerDismissal
        onOpenChange={(next) => {
          if (!next) closeCashTender()
        }}
      >
        <DialogContent
          className="h-[100dvh] max-h-[100dvh] w-full max-w-full rounded-none p-4 sm:h-auto sm:max-h-[min(92vh,900px)] sm:max-w-md sm:rounded-xl sm:p-6"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>Collect cash</DialogTitle>
            <DialogDescription>
              Cash slip #{nextCash.sequence} · enter amount received (whole
              rupees only).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
              <p className="text-xs text-muted-foreground">Amount due</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatRupeesWhole(dueRupees)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
              <p className="text-xs text-muted-foreground">Cash received</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatRupeesWhole(cashReceived)}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "rounded-lg border px-3 py-3 text-center",
              canCompleteCash
                ? "border-border bg-muted/30"
                : "border-destructive/40 bg-destructive/5"
            )}
          >
            <p className="text-xs text-muted-foreground">Cash to return</p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                cashChange < 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {formatRupeesWhole(Math.max(0, cashChange))}
            </p>
            {cashChange < 0 ? (
              <p className="mt-1 text-xs text-destructive">
                Short by {formatRupeesWhole(-cashChange)}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYPAD.map((key) => (
              <Button
                key={key}
                type="button"
                variant={key === "⌫" ? "outline" : "secondary"}
                className="h-12 text-lg font-semibold tabular-nums"
                disabled={busy}
                onClick={() => pressKeypad(key)}
              >
                {key}
              </Button>
            ))}
          </div>

          {confirmError ? (
            <p className="text-sm text-destructive">{confirmError}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={closeCashTender}
            >
              Back
            </Button>
            {canCompleteCash ? (
              <Button
                type="button"
                size="lg"
                className="min-w-40"
                disabled={busy}
                onClick={() => void submitCashPaid()}
              >
                {busy ? "Saving…" : "Mark as Paid"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground sm:text-right">
                Enter cash received to unlock Mark as Paid
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SuggestionList({
  items,
  onSelect,
}: {
  items: CustomerRecord[]
  onSelect: (customer: CustomerRecord) => void
}) {
  return (
    <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md">
      {items.map((customer) => (
        <li key={customer.id}>
          <button
            type="button"
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(customer)}
          >
            <span className="font-medium">{customer.name}</span>
            {customer.phone ? (
              <span className="text-xs text-muted-foreground">
                {customer.phone}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
