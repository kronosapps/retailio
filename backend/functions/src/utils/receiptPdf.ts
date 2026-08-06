import * as admin from "firebase-admin"
import PDFDocument from "pdfkit"

export type ReceiptPdfInput = {
  businessName: string
  businessAddress?: string
  storeGst?: string
  receiptFooter?: string
  invoiceId: string
  createdAt: string
  customerName: string
  paymentMethod?: string | null
  transactionReference?: string | null
  lines: Array<{
    name: string
    weight?: string
    qty: number
    lineTotal: number
  }>
  taxable: number
  gst: number
  discount: number
  total: number
}

/**
 * Build a simple PDF receipt buffer and upload to Firebase Storage.
 * Returns a signed download URL (7 days).
 */
export async function generateAndUploadReceiptPdf(
  input: ReceiptPdfInput
): Promise<string> {
  const buffer = await buildPdfBuffer(input)
  const bucket = admin.storage().bucket()
  const path = `receipts/${input.invoiceId}/${Date.now()}.pdf`
  const file = bucket.file(path)

  await file.save(buffer, {
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=3600",
    },
  })

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })
  return url
}

function buildPdfBuffer(input: ReceiptPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" })
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.fontSize(18).text(input.businessName || "RetailOS Store", { align: "left" })
    if (input.businessAddress) {
      doc.fontSize(9).fillColor("#555").text(input.businessAddress)
    }
    if (input.storeGst) {
      doc.fontSize(9).text(`GSTIN: ${input.storeGst}`)
    }
    doc.moveDown()
    doc.fillColor("#000").fontSize(12).text(`Invoice: ${input.invoiceId}`)
    doc.fontSize(10).text(`Date: ${input.createdAt}`)
    doc.text(`Customer: ${input.customerName}`)
    if (input.paymentMethod) doc.text(`Payment: ${input.paymentMethod}`)
    if (input.transactionReference) {
      doc.text(`Reference: ${input.transactionReference}`)
    }
    doc.moveDown()

    doc.fontSize(10).text("Items", { underline: true })
    for (const line of input.lines) {
      const label = `${line.name}${line.weight ? ` (${line.weight})` : ""} × ${line.qty}`
      doc.text(`${label}    ₹${line.lineTotal.toFixed(2)}`)
    }

    doc.moveDown()
    doc.text(`Subtotal: ₹${input.taxable.toFixed(2)}`)
    if (input.discount > 0) doc.text(`Discount: ₹${input.discount.toFixed(2)}`)
    doc.text(`GST: ₹${input.gst.toFixed(2)}`)
    doc.fontSize(12).text(`Grand total: ₹${input.total.toFixed(2)}`)

    if (input.receiptFooter) {
      doc.moveDown()
      doc.fontSize(9).fillColor("#555").text(input.receiptFooter)
    }

    doc.end()
  })
}
