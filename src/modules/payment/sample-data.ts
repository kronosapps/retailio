/** Sample merchant defaults for local / demo use. Override in Payment Settings. */
export const SAMPLE_PAYMENT_SETTINGS = {
  merchantName: "RetailOS Store",
  merchantUpiId: "retailos@upi",
  merchantMobile: "9999999999",
  currency: "INR",
  paymentTimeoutMinutes: 10,
  sheetsWebhookUrl: "",
} as const
