import QRCode from "qrcode"

import { PaymentError } from "../types"

/** Generate a fresh QR data URL from the complete UPI URL (never a static image). */
export async function generateQrDataUrl(upiUrl: string): Promise<string> {
  if (!upiUrl.startsWith("upi://")) {
    throw new PaymentError("QR_FAILED", "Cannot generate QR for an invalid UPI URL.")
  }

  try {
    return await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    })
  } catch {
    throw new PaymentError("QR_FAILED", "QR code generation failed. Try Regenerate.")
  }
}
