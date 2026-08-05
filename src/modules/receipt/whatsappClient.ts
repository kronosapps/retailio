/**
 * Company WhatsApp send — posts to a webhook (Apps Script / Cloud Function / BSP).
 * The browser cannot send as a Business account by itself; the webhook owns the API token.
 */

import { env } from "@/core/config/env"
import { getPaymentSettings } from "@/modules/payment/settings/paymentSettings"

export type WhatsAppSendRequest = {
  to: string
  message: string
  invoiceId: string
}

export function getWhatsAppWebhookUrl(): string {
  const fromEnv = env.whatsappWebhookUrl
  if (fromEnv) return fromEnv
  return getPaymentSettings().whatsappWebhookUrl.trim()
}

export function isBusinessWhatsAppConfigured(): boolean {
  return Boolean(getWhatsAppWebhookUrl())
}

export function getWhatsAppBusinessLabel(): string {
  const settings = getPaymentSettings()
  return (
    settings.whatsappBusinessName.trim() ||
    settings.merchantName.trim() ||
    "Store WhatsApp"
  )
}

/**
 * Send receipt text via company WhatsApp webhook.
 * Uses text/plain + no-cors so Apps Script web apps accept the request (same as Sheets).
 */
export async function sendBusinessWhatsAppReceipt(
  input: WhatsAppSendRequest
): Promise<void> {
  const url = getWhatsAppWebhookUrl()
  if (!url) {
    throw new Error(
      "Company WhatsApp is not configured. Add a webhook URL in merchant settings or VITE_WHATSAPP_WEBHOOK_URL."
    )
  }

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    cache: "no-cache",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "send_receipt",
      channel: "whatsapp",
      to: input.to,
      message: input.message,
      invoiceId: input.invoiceId,
      businessName: getWhatsAppBusinessLabel(),
    }),
  })
}
