/**
 * Backend-only WhatsApp credentials.
 * Never expose these to the Vite frontend.
 */
export function whatsappConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
  }
}

export function isWhatsAppConfigured(): boolean {
  const cfg = whatsappConfig()
  return Boolean(cfg.phoneNumberId && cfg.accessToken)
}
