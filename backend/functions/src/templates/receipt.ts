/**
 * Approved WhatsApp template body parameters.
 * Template name defaults to `receipt_notification` — create/approve in Meta.
 *
 * Hello {{1}}
 * Thank you for shopping with {{2}}
 * Invoice Number: {{3}}
 * Amount Paid: ₹{{4}}
 * Payment Method: {{5}}
 * Your receipt: {{6}}
 */
export type ReceiptTemplateParams = {
  customerName: string
  businessName: string
  invoiceNumber: string
  amountRupees: string
  paymentMethod: string
  receiptUrl: string
}

export function buildReceiptTemplateComponents(params: ReceiptTemplateParams) {
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: params.customerName || "Customer" },
        { type: "text", text: params.businessName || "Store" },
        { type: "text", text: params.invoiceNumber },
        { type: "text", text: params.amountRupees },
        { type: "text", text: params.paymentMethod || "—" },
        { type: "text", text: params.receiptUrl || "Available in store" },
      ],
    },
  ]
}

export const RECEIPT_TEMPLATE_NAME = "receipt_notification"
