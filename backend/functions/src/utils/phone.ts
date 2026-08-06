/** Normalize to WhatsApp Cloud API digits (country code, no +). */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, "")
  if (digits.length === 10) digits = `91${digits}`
  if (digits.length < 11) return null
  return digits
}
