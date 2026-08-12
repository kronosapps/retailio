import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"

import { CustomerService } from "@/modules/customer"
import { CrmService } from "@/modules/crm"
import { isWalkInName } from "@/data/customers"
import { useAuth } from "@/providers/AuthProvider"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"

import { manualUpiProvider } from "../providers/ManualUPIProvider"
import {
  closePayment,
  getPaymentSession,
  subscribePaymentSession,
} from "../session"
import { startPaymentSession } from "../services/paymentSession"
import {
  getPaymentSettings,
  savePaymentSettings,
  type PaymentSettings,
} from "../settings/paymentSettings"
import { allocateCashReceipt } from "../store/cashCounter"
import {
  appendPaymentLog,
  getPaymentByInvoiceId,
} from "../store/paymentStore"
import {
  PaymentError,
  type Payment,
  type PaymentMethod,
  type PaymentSettlementInput,
} from "../types"
import { normalizeUpiTxnLast4 } from "../utils"

export function usePayment() {
  const { userId, profile } = useAuth()
  const uiSession = useSyncExternalStore(
    subscribePaymentSession,
    getPaymentSession,
    getPaymentSession
  )

  const [settings, setSettings] = useState<PaymentSettings>(() =>
    getPaymentSettings()
  )
  const [method, setMethod] = useState<PaymentMethod>("UPI")
  const [customerName, setCustomerName] = useState("Walk-in")
  const [customerPhone, setCustomerPhone] = useState("")
  const [remarks, setRemarks] = useState("")
  const [payment, setPayment] = useState<Payment | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [showSettings, setShowSettings] = useState(false)

  const invoice = uiSession.invoice

  useEffect(() => {
    if (!uiSession.open || !invoice) return

    setCustomerName(invoice.customerName || "Walk-in")
    setCustomerPhone(invoice.customerPhone || "")
    setMethod("UPI")
    setRemarks("")
    setError(null)
    setShowSettings(false)
    setSettings(getPaymentSettings())

    if (invoice.paymentStatus === "Paid") {
      setError("Invoice is already paid.")
      setPayment(null)
      setQrDataUrl(null)
      return
    }
    if (invoice.paymentStatus === "Refunded") {
      setError("Invoice was refunded.")
      setPayment(null)
      setQrDataUrl(null)
      return
    }

    let cancelled = false
    setBusy(true)
    void startPaymentSession({
      invoice,
      method: "UPI",
      customerName: invoice.customerName || "Walk-in",
      customerPhone: invoice.customerPhone || null,
      customerId: invoice.customerId || null,
      remarks: null,
    })
      .then((result) => {
        if (cancelled) return
        setPayment(result.session)
        setQrDataUrl(result.qrDataUrl)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof PaymentError
            ? err.message
            : "Could not start payment session."
        )
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [uiSession.open, invoice?.invoiceId])

  useEffect(() => {
    if (!uiSession.open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [uiSession.open])

  const remainingSeconds = useMemo(() => {
    if (!payment?.qrExpiresAt || payment.paymentMethod !== "UPI") return null
    if (payment.status !== "Pending") return 0
    return Math.max(
      0,
      Math.floor((new Date(payment.qrExpiresAt).getTime() - now) / 1000)
    )
  }, [payment, now])

  useEffect(() => {
    if (!payment || payment.status !== "Pending") return
    if (payment.paymentMethod !== "UPI" || !payment.qrExpiresAt) return
    if (remainingSeconds !== 0) return

    void (async () => {
      try {
        const expired = await paymentRepository.update(payment.paymentId, {
          status: "Expired",
        })
        setPayment(expired)
        await invoiceRepository.updatePaymentFields(payment.invoiceId, {
          paymentId: expired.paymentId,
          paymentStatus: "Expired",
          paymentMethod: expired.paymentMethod,
        })
        appendPaymentLog({
          paymentId: payment.paymentId,
          invoiceId: payment.invoiceId,
          event: "EXPIRED",
          message: `Payment session ${payment.paymentId} expired.`,
        })
      } catch {
        // ignore
      }
    })()
  }, [remainingSeconds, payment])

  const changeMethod = useCallback(
    async (nextMethod: PaymentMethod) => {
      if (!invoice || !payment) return
      if (payment.status === "Paid") {
        setError("Invoice is already paid.")
        return
      }
      setBusy(true)
      setError(null)
      setMethod(nextMethod)
      try {
        const result = await startPaymentSession({
          invoice,
          method: nextMethod,
          customerName,
          customerPhone: customerPhone.trim() || null,
          customerId: invoice.customerId || null,
          remarks: remarks.trim() || null,
        })
        setPayment(result.session)
        setQrDataUrl(result.qrDataUrl)
      } catch (err) {
        setError(
          err instanceof PaymentError
            ? err.message
            : "Could not change payment method."
        )
      } finally {
        setBusy(false)
      }
    },
    [invoice, payment, customerName, customerPhone, remarks]
  )

  const regenerateQr = useCallback(async () => {
    if (!invoice) return
    setBusy(true)
    setError(null)
    try {
      // New session + fresh QR (retries / expired QR).
      const result = await startPaymentSession({
        invoice,
        method: "UPI",
        customerName,
        customerPhone: customerPhone.trim() || null,
        customerId: invoice.customerId || null,
        remarks: remarks.trim() || null,
        regenerate: true,
      })
      setMethod("UPI")
      setPayment(result.session)
      setQrDataUrl(result.qrDataUrl)
    } catch (err) {
      setError(
        err instanceof PaymentError
          ? err.message
          : "Could not start a new payment session."
      )
    } finally {
      setBusy(false)
    }
  }, [invoice, customerName, customerPhone, remarks])

  const markPaid = useCallback(
    async (settlement: PaymentSettlementInput) => {
      if (!payment || !invoice) return
      if (payment.status === "Paid") {
        setError("Invoice is already paid.")
        return
      }
      if (payment.status === "Expired") {
        setError("Payment session expired. Regenerate QR first.")
        return
      }
      if (payment.status !== "Pending") {
        setError("Only pending payment sessions can be marked paid.")
        return
      }
      if (settlement.method !== method) {
        setError("Payment method changed. Try again.")
        return
      }

      let upiTxnLast4: string | null = null
      if (settlement.method === "UPI") {
        upiTxnLast4 = normalizeUpiTxnLast4(settlement.upiTxnLast4)
        if (!upiTxnLast4) {
          setError("Enter the last 4 digits of the UPI transaction ID.")
          return
        }
      }

      if (settlement.method === "OnAccount") {
        const hasIdentity =
          !isWalkInName(customerName) || Boolean(customerPhone.trim())
        if (!hasIdentity) {
          setError("On account requires a named customer or mobile number.")
          return
        }
      }

      setBusy(true)
      setError(null)
      try {
        const verified = await manualUpiProvider.verifyPayment(payment)
        if (!verified.verified || verified.status !== "Paid") {
          throw new PaymentError(
            "EXPIRED",
            verified.message || "Could not verify payment session."
          )
        }

        let cashReceiptNumber: number | null = null
        let cashReceiptId: string | null = null
        if (settlement.method === "Cash") {
          const cash = allocateCashReceipt()
          cashReceiptNumber = cash.sequence
          cashReceiptId = cash.cashReceiptId
        }

        const paidAt = new Date().toISOString()
        const customer = await CustomerService.upsertFromCheckout({
          name: customerName,
          phone: customerPhone,
          storeId: profile?.storeId ?? null,
          actorId: userId,
          purchasePaisa: invoice.amountPaisa,
          purchasedAt: paidAt,
        })

        if (settlement.method === "OnAccount" && !customer) {
          throw new PaymentError(
            "UNKNOWN",
            "Could not resolve customer for on-account sale."
          )
        }

        let storeCreditAppliedPaisa = Math.max(
          0,
          Math.round(settlement.storeCreditAppliedPaisa || 0)
        )
        if (customer && storeCreditAppliedPaisa > 0) {
          storeCreditAppliedPaisa = Math.min(
            storeCreditAppliedPaisa,
            customer.storeCreditPaisa,
            invoice.amountPaisa
          )
          if (storeCreditAppliedPaisa > 0) {
            const applied = await CrmService.applyStoreCredit({
              customerId: customer.id,
              amountPaisa: storeCreditAppliedPaisa,
              invoiceId: invoice.invoiceId,
              actorId: userId,
            })
            storeCreditAppliedPaisa = applied.appliedPaisa
          }
        } else {
          storeCreditAppliedPaisa = 0
        }

        const tenderPaisa = Math.max(
          0,
          invoice.amountPaisa - storeCreditAppliedPaisa
        )

        // Repository persists + publishes PAYMENT_RECEIVED → SyncManager → Sheets
        const paid = await paymentRepository.update(payment.paymentId, {
          status: "Paid",
          paidAt,
          customerName,
          customerId: customer?.id ?? null,
          customerPhone: customer?.phone ?? (customerPhone.trim() || null),
          remarks: remarks.trim() || payment.remarks,
          paymentMethod: settlement.method,
          upiTxnLast4,
          cashReceiptNumber,
          cashReceiptId,
          storeCreditAppliedPaisa,
        })

        await invoiceRepository.updatePaymentFields(invoice.invoiceId, {
          paymentId: paid.paymentId,
          paymentStatus: "Paid",
          paymentMethod: paid.paymentMethod,
          customerName,
          customerId: customer?.id ?? null,
          customerPhone: customer?.phone ?? (customerPhone.trim() || null),
          storeCreditAppliedPaisa,
        })

        if (customer) {
          const sale = await invoiceRepository.getById(invoice.invoiceId)
          const redeemedLoyalty =
            sale?.loyalty?.mode === "percent" ||
            sale?.loyalty?.mode === "item"
          await CrmService.recordPaidPurchase({
            customerId: customer.id,
            purchasePaisa: invoice.amountPaisa,
            redeemedLoyalty,
            pointsRedeemed: sale?.totals.pointsRedeemed || 0,
            actorId: userId,
          })
          if (settlement.method === "OnAccount" && tenderPaisa > 0) {
            await CrmService.bumpOutstanding({
              customerId: customer.id,
              amountPaisa: tenderPaisa,
              actorId: userId,
            })
          }
        }

        const tallyRef =
          paid.paymentMethod === "UPI"
            ? `UPI …${paid.upiTxnLast4}`
            : paid.paymentMethod === "OnAccount"
              ? "On account"
              : paid.cashReceiptId || `Cash #${paid.cashReceiptNumber}`

        appendPaymentLog({
          paymentId: paid.paymentId,
          invoiceId: paid.invoiceId,
          event: "MARKED_PAID",
          message: `Session ${paid.paymentId} marked paid via ${paid.paymentMethod} (${tallyRef})${
            storeCreditAppliedPaisa > 0
              ? ` · store credit −${(storeCreditAppliedPaisa / 100).toFixed(2)}`
              : ""
          }.`,
        })

        setPayment(paid)
        uiSession.callbacks.onPaid?.(invoice.invoiceId)
        closePayment()
      } catch (err) {
        setError(
          err instanceof PaymentError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not mark payment as paid."
        )
      } finally {
        setBusy(false)
      }
    },
    [
      payment,
      invoice,
      customerName,
      customerPhone,
      remarks,
      method,
      uiSession.callbacks,
      profile?.storeId,
      userId,
    ]
  )

  const cancelPayment = useCallback(async () => {
    if (!payment || !invoice) {
      closePayment()
      return
    }
    const latest = getPaymentByInvoiceId(invoice.invoiceId)
    if (latest?.status === "Paid" || payment.status === "Paid") {
      closePayment()
      return
    }
    try {
      const result = await manualUpiProvider.cancel(payment)
      const cancelled = await paymentRepository.update(payment.paymentId, {
        status: result.status === "Cancelled" ? "Cancelled" : payment.status,
      })
      await invoiceRepository.updatePaymentFields(invoice.invoiceId, {
        paymentId: cancelled.paymentId,
        paymentStatus: cancelled.status,
        paymentMethod: cancelled.paymentMethod,
      })
      appendPaymentLog({
        paymentId: cancelled.paymentId,
        invoiceId: cancelled.invoiceId,
        event: "CANCELLED",
        message: `Payment session ${cancelled.paymentId} cancelled by cashier.`,
      })
      uiSession.callbacks.onCancelled?.(invoice.invoiceId)
    } catch {
      // still close
    }
    closePayment()
  }, [payment, invoice, uiSession.callbacks])

  const persistSettings = useCallback((patch: Partial<PaymentSettings>) => {
    const next = savePaymentSettings(patch)
    setSettings(next)
    return next
  }, [])

  return {
    open: uiSession.open,
    invoice,
    payment,
    method,
    setMethod: changeMethod,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
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
    canMarkPaid:
      !!payment &&
      payment.status === "Pending" &&
      (payment.paymentMethod !== "UPI" ||
        (remainingSeconds !== null && remainingSeconds > 0) ||
        payment.qrExpiresAt === null),
  }
}
