/** Sample merchant defaults for local / demo use. Override in Payment Settings. */
export const SAMPLE_PAYMENT_SETTINGS = {
  merchantName: "Rani",
  merchantUpiId: "9000503476@ybl",
  merchantMobile: "9000503476",
  currency: "INR",
  paymentTimeoutMinutes: 10,
  sheetsWebhookUrl: "",
  /** Display name for company WhatsApp sender */
  whatsappBusinessName: "",
  /**
   * Webhook that sends via WhatsApp Business Cloud API / BSP.
   * Prefer VITE_WHATSAPP_WEBHOOK_URL in .env for production.
   */
  whatsappWebhookUrl: "",
} as const
