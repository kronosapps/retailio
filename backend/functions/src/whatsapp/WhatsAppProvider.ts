import {
  buildReceiptTemplateComponents,
  RECEIPT_TEMPLATE_NAME,
  type ReceiptTemplateParams,
} from "../templates/receipt"
import { isWhatsAppConfigured, whatsappConfig } from "../utils/config"
import { normalizeWhatsAppPhone } from "../utils/phone"

export type WhatsAppSendResult = {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * Meta WhatsApp Business Cloud API provider.
 * Runs only inside Cloud Functions — never in React.
 */
export class WhatsAppProvider {
  readonly id = "whatsapp-cloud"
  readonly channel = "whatsapp" as const

  async sendReceipt(input: {
    to: string
    templateName?: string
    params: ReceiptTemplateParams
    phoneNumberIdOverride?: string
  }): Promise<WhatsAppSendResult> {
    return this.sendTemplate({
      to: input.to,
      templateName: input.templateName || RECEIPT_TEMPLATE_NAME,
      components: buildReceiptTemplateComponents(input.params),
      phoneNumberIdOverride: input.phoneNumberIdOverride,
    })
  }

  async sendInvoice(input: {
    to: string
    params: ReceiptTemplateParams
  }): Promise<WhatsAppSendResult> {
    return this.sendReceipt({ ...input, templateName: "invoice_notification" })
  }

  async sendOrderConfirmation(input: {
    to: string
    params: ReceiptTemplateParams
  }): Promise<WhatsAppSendResult> {
    return this.sendReceipt({
      ...input,
      templateName: "order_confirmation",
    })
  }

  async sendPaymentSuccess(input: {
    to: string
    params: ReceiptTemplateParams
  }): Promise<WhatsAppSendResult> {
    return this.sendReceipt({
      ...input,
      templateName: "payment_success",
    })
  }

  async sendRefund(input: {
    to: string
    params: ReceiptTemplateParams
  }): Promise<WhatsAppSendResult> {
    return this.sendReceipt({
      ...input,
      templateName: "refund_notification",
    })
  }

  async send(notification: {
    customerPhone: string | null
    templateName?: string | null
    params: ReceiptTemplateParams
    phoneNumberIdOverride?: string
  }): Promise<WhatsAppSendResult> {
    const to = normalizeWhatsAppPhone(notification.customerPhone)
    if (!to) {
      return { ok: false, error: "Customer phone is missing or invalid." }
    }
    return this.sendReceipt({
      to,
      templateName: notification.templateName || RECEIPT_TEMPLATE_NAME,
      params: notification.params,
      phoneNumberIdOverride: notification.phoneNumberIdOverride,
    })
  }

  async retry(notification: {
    customerPhone: string | null
    templateName?: string | null
    params: ReceiptTemplateParams
    phoneNumberIdOverride?: string
  }): Promise<WhatsAppSendResult> {
    return this.send(notification)
  }

  async cancel(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  private async sendTemplate(input: {
    to: string
    templateName: string
    components: unknown[]
    phoneNumberIdOverride?: string
  }): Promise<WhatsAppSendResult> {
    if (!isWhatsAppConfigured() && !input.phoneNumberIdOverride) {
      return {
        ok: false,
        error:
          "WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
      }
    }

    const cfg = whatsappConfig()
    const phoneNumberId =
      input.phoneNumberIdOverride || cfg.phoneNumberId
    if (!phoneNumberId || !cfg.accessToken) {
      return { ok: false, error: "Missing WhatsApp phone number id or token." }
    }

    const url = `https://graph.facebook.com/${cfg.apiVersion}/${phoneNumberId}/messages`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: input.to,
          type: "template",
          template: {
            name: input.templateName,
            language: { code: "en" },
            components: input.components,
          },
        }),
      })

      const json = (await response.json()) as {
        messages?: Array<{ id?: string }>
        error?: { message?: string }
      }

      if (!response.ok) {
        return {
          ok: false,
          error: json.error?.message || `WhatsApp API HTTP ${response.status}`,
        }
      }

      return {
        ok: true,
        messageId: json.messages?.[0]?.id,
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "WhatsApp send failed",
      }
    }
  }
}

export const whatsAppProvider = new WhatsAppProvider()
