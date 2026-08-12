import * as admin from "firebase-admin"
import { logger } from "firebase-functions"

import { whatsAppProvider } from "../whatsapp/WhatsAppProvider"
import { telegramProvider } from "../telegram/TelegramProvider"
import { telegramConfig } from "../utils/config"
import { generateAndUploadReceiptPdf } from "../utils/receiptPdf"
import { MAX_RETRIES, nextRetryAt, shouldRetry } from "./retry"

type NotificationDoc = {
  notificationId: string
  invoiceId: string
  paymentId?: string | null
  customerId?: string | null
  customerName?: string
  customerPhone?: string | null
  storeId?: string | null
  channel?: string
  audience?: string
  status?: string
  messageType?: string
  templateName?: string | null
  title?: string | null
  receiptUrl?: string | null
  messageId?: string | null
  retryCount?: number
  error?: string | null
  meta?: Record<string, unknown>
  priority?: string
}

type InvoiceDoc = {
  invoiceId?: string
  customerName?: string
  customerPhone?: string | null
  paymentMethod?: string | null
  createdAt?: string
  storeId?: string | null
  lines?: Array<{
    name: string
    weight?: string
    qty: number
    lineTotalPaisa?: number
  }>
  totals?: {
    taxableAmount?: number
    gstAmount?: number
    friendsFamilyDiscount?: number
    occasionDiscount?: number
    loyaltyDiscount?: number
    total?: number
  }
  paymentId?: string | null
}

type StoreSettingsDoc = {
  businessName?: string
  businessAddress?: string
  storeGst?: string
  receiptFooter?: string
  phoneNumberId?: string
}

function paisaToRupees(paisa: number | undefined): number {
  if (!Number.isFinite(paisa)) return 0
  return (paisa as number) / 100
}

async function appendLog(
  notificationId: string,
  event: string,
  message: string
) {
  await admin.firestore().collection("notification_logs").add({
    notificationId,
    event,
    message,
    createdAt: new Date().toISOString(),
  })
}

/**
 * Process a queued notification: PDF → WhatsApp template → status update.
 */
export async function processNotification(notificationId: string): Promise<void> {
  const db = admin.firestore()
  const ref = db.collection("notifications").doc(notificationId)
  const snap = await ref.get()
  if (!snap.exists) {
    logger.warn("Notification missing", { notificationId })
    return
  }

  const notification = {
    notificationId,
    ...snap.data(),
  } as NotificationDoc

  if (
    notification.status === "Sent" ||
    notification.status === "Delivered" ||
    notification.status === "Read" ||
    notification.status === "Cancelled"
  ) {
    return
  }

  // Soft inbox — client-delivered.
  if (notification.channel === "in_app") {
    return
  }

  // Staff critical night-phone via Telegram (audience may be staff).
  if (notification.channel === "telegram") {
    await processTelegramAlert(ref, notification)
    return
  }

  // Staff WhatsApp not supported — ignore accidental queues.
  if (notification.audience === "staff") {
    return
  }

  await ref.set(
    {
      status: "Sending",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
  await appendLog(notificationId, "sending", "Cloud Function started send.")

  const invoiceSnap = await db
    .collection("invoices")
    .doc(notification.invoiceId)
    .get()
  const invoice = (invoiceSnap.data() || {}) as InvoiceDoc

  const storeId = notification.storeId || invoice.storeId || "store-1"
  const settingsSnap = await db
    .collection("settings")
    .doc(`store_${storeId}`)
    .get()
  const settings = (settingsSnap.data() || {}) as StoreSettingsDoc

  const businessName = settings.businessName || "Store"
  const totals = invoice.totals || {}
  const discount =
    paisaToRupees(totals.friendsFamilyDiscount) +
    paisaToRupees(totals.occasionDiscount) +
    paisaToRupees(totals.loyaltyDiscount)

  let receiptUrl = notification.receiptUrl || null
  try {
    receiptUrl = await generateAndUploadReceiptPdf({
      businessName,
      businessAddress: settings.businessAddress,
      storeGst: settings.storeGst,
      receiptFooter: settings.receiptFooter,
      invoiceId: notification.invoiceId,
      createdAt: invoice.createdAt || new Date().toISOString(),
      customerName:
        notification.customerName || invoice.customerName || "Walk-in",
      paymentMethod: invoice.paymentMethod,
      transactionReference: invoice.paymentId || notification.paymentId || null,
      lines: (invoice.lines || []).map((line) => ({
        name: line.name,
        weight: line.weight,
        qty: line.qty,
        lineTotal: paisaToRupees(line.lineTotalPaisa),
      })),
      taxable: paisaToRupees(totals.taxableAmount),
      gst: paisaToRupees(totals.gstAmount),
      discount,
      total: paisaToRupees(totals.total),
    })
  } catch (err) {
    logger.error("PDF generation failed — continuing with template", err)
  }

  const amountRupees = paisaToRupees(totals.total).toFixed(2)
  const result = await whatsAppProvider.send({
    customerPhone: notification.customerPhone || invoice.customerPhone || null,
    templateName: notification.templateName || "receipt_notification",
    phoneNumberIdOverride: settings.phoneNumberId || undefined,
    params: {
      customerName:
        notification.customerName || invoice.customerName || "Customer",
      businessName,
      invoiceNumber: notification.invoiceId,
      amountRupees,
      paymentMethod: invoice.paymentMethod || "—",
      receiptUrl: receiptUrl || "Ask store for copy",
    },
  })

  if (result.ok) {
    await ref.set(
      {
        status: "Sent",
        messageId: result.messageId || null,
        receiptUrl,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
      },
      { merge: true }
    )
    await appendLog(
      notificationId,
      "sent",
      `WhatsApp message ${result.messageId || "ok"}`
    )
    return
  }

  const retryCount = (notification.retryCount || 0) + 1
  if (shouldRetry(retryCount)) {
    const nextAt = nextRetryAt(retryCount - 1)
    await ref.set(
      {
        status: "Queued",
        retryCount,
        nextRetryAt: nextAt,
        error: result.error || "Send failed",
        receiptUrl,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )
    await appendLog(
      notificationId,
      "retry",
      `Retry ${retryCount}/${MAX_RETRIES} scheduled for ${nextAt}`
    )
    return
  }

  await ref.set(
    {
      status: "Failed",
      retryCount,
      error: result.error || "Send failed after max retries",
      receiptUrl,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
  await appendLog(
    notificationId,
    "failed",
    result.error || "Max retries exhausted"
  )
}

/**
 * Ensure a notification exists for a paid payment (idempotent by invoice).
 */
export async function ensureReceiptNotification(payment: {
  paymentId: string
  invoiceId: string
  invoiceNumber?: string
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
  storeId?: string | null
  status?: string
}): Promise<string | null> {
  if (payment.status !== "Paid") return null
  const phone = (payment.customerPhone || "").replace(/\D/g, "")
  if (phone.length < 8) return null

  const db = admin.firestore()
  const invoiceId = payment.invoiceNumber || payment.invoiceId
  const existing = await db
    .collection("notifications")
    .where("invoiceId", "==", invoiceId)
    .where("messageType", "==", "receipt")
    .where("channel", "==", "whatsapp")
    .limit(5)
    .get()

  const open = existing.docs.find((doc) => {
    const status = doc.data().status as string
    return ["Queued", "Sending", "Sent", "Delivered", "Read"].includes(status)
  })
  if (open) return open.id

  const notificationId = `ntf_${payment.paymentId}`
  const now = new Date().toISOString()
  await db
    .collection("notifications")
    .doc(notificationId)
    .set(
      {
        notificationId,
        invoiceId,
        paymentId: payment.paymentId,
        customerId: payment.customerId ?? null,
        customerName: payment.customerName || "Walk-in",
        customerPhone: phone,
        storeId: payment.storeId ?? null,
        channel: "whatsapp",
        status: "Queued",
        messageType: "receipt",
        templateName: "receipt_notification",
        receiptUrl: null,
        messageId: null,
        createdAt: now,
        sentAt: null,
        updatedAt: now,
        retryCount: 0,
        nextRetryAt: null,
        error: null,
      },
      { merge: true }
    )

  await appendLog(notificationId, "created", "Auto-queued from payment Paid.")
  return notificationId
}

async function processTelegramAlert(
  ref: FirebaseFirestore.DocumentReference,
  notification: NotificationDoc
): Promise<void> {
  const notificationId = notification.notificationId
  await ref.set(
    {
      status: "Sending",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
  await appendLog(notificationId, "sending", "Telegram critical alert send started.")

  const meta = notification.meta || {}
  const chatId =
    (typeof meta.telegramChatId === "string" && meta.telegramChatId) ||
    telegramConfig().defaultChatId ||
    ""
  const body =
    (typeof meta.body === "string" && meta.body) ||
    notification.title ||
    notification.messageType ||
    "RetailOS alert"
  const title = notification.title || "RetailOS alert"
  const text = `🚨 ${title}\n${body}`

  const result = await telegramProvider.send({ chatId, text })
  if (result.ok) {
    await ref.set(
      {
        status: "Sent",
        messageId: result.messageId || null,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null,
      },
      { merge: true }
    )
    await appendLog(notificationId, "sent", "Telegram alert delivered.")
    return
  }

  const retryCount = notification.retryCount || 0
  if (shouldRetry(retryCount)) {
    const next = nextRetryAt(retryCount)
    await ref.set(
      {
        status: "Queued",
        retryCount: retryCount + 1,
        nextRetryAt: next,
        error: result.error || "Telegram send failed",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )
    await appendLog(
      notificationId,
      "retry",
      `Telegram failed; retry ${retryCount + 1}/${MAX_RETRIES} at ${next}`
    )
    return
  }

  await ref.set(
    {
      status: "Failed",
      error: result.error || "Telegram send failed",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
  await appendLog(notificationId, "failed", result.error || "Telegram failed")
}

