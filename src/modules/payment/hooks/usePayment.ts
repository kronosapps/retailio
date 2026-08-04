import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"

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
import {
  appendPaymentLog,
  getPaymentByInvoiceId,
} from "../store/paymentStore"
import { PaymentError, type Payment, type PaymentMethod } from "../types"

export function usePayment() {
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

    let cancelled = false
    setBusy(true)
    void startPaymentSession({
      invoice,
      method: "UPI",
      customerName: invoice.customerName || "Walk-in",
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
    [invoice, payment, customerName, remarks]
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
  }, [invoice, customerName, remarks])

  const markPaid = useCallback(async () => {
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

      const paidAt = new Date().toISOString()
      // Repository persists + publishes PAYMENT_RECEIVED → SyncManager → Sheets
      const paid = await paymentRepository.update(payment.paymentId, {
        status: "Paid",
        paidAt,
        customerName,
        remarks: remarks.trim() || payment.remarks,
        paymentMethod: method,
      })

      await invoiceRepository.updatePaymentFields(invoice.invoiceId, {
        paymentId: paid.paymentId,
        paymentStatus: "Paid",
        paymentMethod: paid.paymentMethod,
        customerName,
      })

      appendPaymentLog({
        paymentId: paid.paymentId,
        invoiceId: paid.invoiceId,
        event: "MARKED_PAID",
        message: `Session ${paid.paymentId} marked paid via ${paid.paymentMethod}.`,
      })

      setPayment(paid)
      uiSession.callbacks.onPaid?.(invoice.invoiceId)
      closePayment()
    } catch (err) {
      setError(
        err instanceof PaymentError
          ? err.message
          : "Could not mark payment as paid."
      )
    } finally {
      setBusy(false)
    }
  }, [payment, invoice, customerName, remarks, method, uiSession.callbacks])

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
