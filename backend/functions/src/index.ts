import * as admin from "firebase-admin"
import { logger } from "firebase-functions"
import { onDocumentWritten } from "firebase-functions/v2/firestore"
import { onRequest } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"

import {
  ensureReceiptNotification,
  processNotification,
} from "./notifications/engine"
import { whatsappConfig } from "./utils/config"

admin.initializeApp()

/**
 * When a payment becomes Paid, queue a WhatsApp receipt notification.
 * Payment Module never calls WhatsApp — this is the Cloud Function trigger.
 */
export const onPaymentWritten = onDocumentWritten(
  "payments/{paymentId}",
  async (event) => {
    const after = event.data?.after?.data()
    const before = event.data?.before?.data()
    if (!after) return

    const becamePaid =
      after.status === "Paid" && before?.status !== "Paid"
    if (!becamePaid) return

    const notificationId = await ensureReceiptNotification({
      paymentId: String(after.paymentId || event.params.paymentId),
      invoiceId: String(after.invoiceId || ""),
      invoiceNumber: after.invoiceNumber as string | undefined,
      customerName: after.customerName as string | undefined,
      customerId: (after.customerId as string | null) ?? null,
      customerPhone: (after.customerPhone as string | null) ?? null,
      storeId: (after.storeId as string | null) ?? null,
      status: after.status as string,
    })

    if (notificationId) {
      await processNotification(notificationId)
    }
  }
)

/**
 * When a notification is Queued (client retry / engine queue), send it.
 */
export const onNotificationWritten = onDocumentWritten(
  "notifications/{notificationId}",
  async (event) => {
    const after = event.data?.after?.data()
    const before = event.data?.before?.data()
    if (!after) return

    const becameQueued =
      after.status === "Queued" && before?.status !== "Queued"
    // Client "Retry" sets retryRequestedAt — process immediately.
    // Auto-retries use nextRetryAt + scheduled sweep (do not re-enter here).
    const clientRetry =
      after.status === "Queued" &&
      after.retryRequestedAt &&
      after.retryRequestedAt !== before?.retryRequestedAt

    if (!becameQueued && !clientRetry) return

    // Skip if waiting for a scheduled retry window.
    if (
      after.nextRetryAt &&
      typeof after.nextRetryAt === "string" &&
      after.nextRetryAt > new Date().toISOString() &&
      !clientRetry
    ) {
      return
    }

    await processNotification(event.params.notificationId)
  }
)

/**
 * Sweep scheduled retries (1m / 5m / 15m).
 */
export const processNotificationRetries = onSchedule(
  "every 1 minutes",
  async () => {
    const now = new Date().toISOString()
    const snap = await admin
      .firestore()
      .collection("notifications")
      .where("status", "==", "Queued")
      .where("nextRetryAt", "<=", now)
      .limit(25)
      .get()

    for (const doc of snap.docs) {
      try {
        await processNotification(doc.id)
      } catch (err) {
        logger.error("Retry processing failed", doc.id, err)
      }
    }
  }
)

/**
 * Meta webhook verification + delivery/read status updates.
 * Set WHATSAPP_VERIFY_TOKEN in function secrets.
 */
export const whatsappWebhook = onRequest(async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"]
    const token = req.query["hub.verify_token"]
    const challenge = req.query["hub.challenge"]
    const verify = whatsappConfig().verifyToken
    if (mode === "subscribe" && token === verify) {
      res.status(200).send(challenge)
      return
    }
    res.status(403).send("Forbidden")
    return
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed")
    return
  }

  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id?: string
              status?: string
              timestamp?: string
            }>
          }
        }>
      }>
    }

    const statuses =
      body.entry?.flatMap(
        (e) => e.changes?.flatMap((c) => c.value?.statuses || []) || []
      ) || []

    for (const status of statuses) {
      if (!status.id || !status.status) continue
      const mapped =
        status.status === "delivered"
          ? "Delivered"
          : status.status === "read"
            ? "Read"
            : status.status === "failed"
              ? "Failed"
              : status.status === "sent"
                ? "Sent"
                : null
      if (!mapped) continue

      const snap = await admin
        .firestore()
        .collection("notifications")
        .where("messageId", "==", status.id)
        .limit(1)
        .get()

      if (snap.empty) continue
      await snap.docs[0].ref.set(
        {
          status: mapped,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
      await admin.firestore().collection("notification_logs").add({
        notificationId: snap.docs[0].id,
        event: mapped.toLowerCase(),
        message: `Webhook status: ${status.status}`,
        createdAt: new Date().toISOString(),
      })
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error("whatsappWebhook error", err)
    res.status(500).json({ ok: false })
  }
})
