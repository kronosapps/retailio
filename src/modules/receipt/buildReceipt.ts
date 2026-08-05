import type { RecordedSale } from "@/data/invoices"
import { formatMoney } from "@/lib/money"
import type { Payment } from "@/modules/payment/types"
import { getPaymentSettings } from "@/modules/payment/settings/paymentSettings"

export type ReceiptContext = {
  sale: RecordedSale
  payment: Payment | null
  merchantName: string
  merchantMobile: string
}

export function loadReceiptContext(
  sale: RecordedSale,
  payment: Payment | null
): ReceiptContext {
  const settings = getPaymentSettings()
  return {
    sale,
    payment,
    merchantName: settings.merchantName.trim() || "RetailOS",
    merchantMobile: settings.merchantMobile.trim(),
  }
}

/** Normalize to WhatsApp international digits (default India 91). */
export function normalizeWhatsAppPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith("91")) return digits
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

function paymentTallyLine(payment: Payment | null): string | null {
  if (!payment) return null
  if (payment.paymentMethod === "UPI" && payment.upiTxnLast4) {
    return `UPI Ref (last 4): ${payment.upiTxnLast4}`
  }
  if (payment.paymentMethod === "Cash" && payment.cashReceiptId) {
    return `Cash slip: ${payment.cashReceiptId}`
  }
  return null
}

/** Plain-text receipt for WhatsApp / share. */
export function buildReceiptText(ctx: ReceiptContext): string {
  const { sale, payment, merchantName, merchantMobile } = ctx
  const lines: string[] = []

  lines.push(`*${merchantName}*`)
  if (merchantMobile) lines.push(`Ph: ${merchantMobile}`)
  lines.push("------------------------------")
  lines.push(`Invoice: ${sale.invoiceId}`)
  lines.push(`Date: ${new Date(sale.createdAt).toLocaleString("en-IN")}`)
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`)
  if (sale.cashierName) lines.push(`Cashier: ${sale.cashierName}`)
  lines.push("------------------------------")

  for (const line of sale.lines) {
    const free = line.isLoyaltyReward ? " (FREE)" : ""
    lines.push(`${line.name} (${line.weight})${free}`)
    lines.push(
      `  ${line.qty} × ${formatMoney(line.unitPricePaisa)} = ${formatMoney(line.lineTotalPaisa)}`
    )
  }

  lines.push("------------------------------")
  lines.push(`Subtotal: ${formatMoney(sale.totals.grossSubtotal)}`)
  if (sale.totals.friendsFamilyDiscount > 0) {
    lines.push(
      `Friends & Family (${sale.totals.friendsFamilyPercent}%): −${formatMoney(sale.totals.friendsFamilyDiscount)}`
    )
  }
  if (sale.totals.occasionDiscount > 0) {
    lines.push(
      `${sale.totals.occasionName ?? "Occasion"} (${sale.totals.occasionPercent}%): −${formatMoney(sale.totals.occasionDiscount)}`
    )
  }
  if (sale.totals.loyaltyDiscount > 0) {
    lines.push(
      `${sale.totals.loyaltyLabel ?? "Loyalty"}: −${formatMoney(sale.totals.loyaltyDiscount)}`
    )
  }
  lines.push(`Taxable: ${formatMoney(sale.totals.taxableAmount)}`)
  lines.push(
    `SGST (${sale.totals.sgstPercent}%): ${formatMoney(sale.totals.sgstAmount)}`
  )
  lines.push(
    `CGST (${sale.totals.cgstPercent}%): ${formatMoney(sale.totals.cgstAmount)}`
  )
  lines.push(`*Total: ${formatMoney(sale.totals.total)}*`)
  lines.push("------------------------------")

  if (payment) {
    lines.push(`Paid via: ${payment.paymentMethod}`)
    lines.push(`Payment ID: ${payment.paymentId}`)
    const tally = paymentTallyLine(payment)
    if (tally) lines.push(tally)
  } else if (sale.paymentMethod) {
    lines.push(`Paid via: ${sale.paymentMethod}`)
  }

  lines.push("Thank you! Visit again.")
  return lines.join("\n")
}

/**
 * WhatsApp deep link.
 * With phone → chat that number. Without → open WhatsApp with text (customer picks contact).
 */
export function buildWhatsAppReceiptUrl(
  text: string,
  phoneDigits: string | null = null
): string {
  const params = new URLSearchParams({ text })
  if (phoneDigits) {
    return `https://wa.me/${phoneDigits}?${params.toString()}`
  }
  return `https://wa.me/?${params.toString()}`
}

/** Thermal-friendly HTML for window.print / print window. */
export function buildReceiptHtml(ctx: ReceiptContext): string {
  const text = buildReceiptText(ctx)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${ctx.sale.invoiceId}</title>
  <style>
    @page { margin: 8mm; size: 80mm auto; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.35;
      color: #111;
      margin: 0;
      padding: 8px;
      white-space: pre-wrap;
      width: 72mm;
    }
  </style>
</head>
<body>${text}</body>
</html>`
}

export function printReceipt(ctx: ReceiptContext): boolean {
  const html = buildReceiptHtml(ctx)
  const popup = window.open("", "_blank", "noopener,noreferrer,width=420,height=720")
  if (!popup) return false
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  // Allow layout before print
  window.setTimeout(() => {
    popup.print()
  }, 250)
  return true
}
