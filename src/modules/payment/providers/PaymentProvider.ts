import type {
  GeneratePaymentInput,
  GeneratePaymentResult,
  Payment,
  VerifyPaymentResult,
} from "../types"

/**
 * Future-ready provider contract.
 * Billing never calls providers directly — only the Payment Module does.
 */
export interface PaymentProvider {
  readonly id: string
  readonly name: string

  generatePayment(input: GeneratePaymentInput): Promise<GeneratePaymentResult>

  /** Manual today; replace with API verification later. */
  verifyPayment(payment: Payment): Promise<VerifyPaymentResult>

  refund(payment: Payment, reason?: string): Promise<VerifyPaymentResult>

  cancel(payment: Payment, reason?: string): Promise<VerifyPaymentResult>
}
