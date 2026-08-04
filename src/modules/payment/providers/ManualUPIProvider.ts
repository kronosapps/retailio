import { buildUpiPaymentUrl } from "../services/upi"
import type { PaymentProvider } from "./PaymentProvider"
import type {
  GeneratePaymentInput,
  GeneratePaymentResult,
  Payment,
  VerifyPaymentResult,
} from "../types"

/**
 * Manual UPI provider.
 * Generates a UPI URL from an existing payment session — never creates the session.
 */
export class ManualUPIProvider implements PaymentProvider {
  readonly id = "manual-upi"
  readonly name = "Manual UPI QR"

  async generatePayment(
    input: GeneratePaymentInput
  ): Promise<GeneratePaymentResult> {
    const { session } = input
    const upiUrl = buildUpiPaymentUrl({
      merchantUpiId: input.merchantUpiId,
      merchantName: input.merchantName,
      amountPaisa: session.amountPaisa,
      currency: input.currency,
      transactionReference: session.transactionReference,
      dailySequence: input.invoice.dailySequence,
    })

    return {
      upiUrl,
      paymentId: session.paymentId,
      transactionReference: session.transactionReference,
      amount: session.amount,
      currency: input.currency,
    }
  }

  async verifyPayment(payment: Payment): Promise<VerifyPaymentResult> {
    if (payment.status === "Paid") {
      return { verified: true, status: "Paid", message: "Already paid." }
    }
    if (payment.status === "Expired") {
      return {
        verified: false,
        status: "Expired",
        message: "Payment session expired. Start a new session / regenerate QR.",
      }
    }
    return {
      verified: true,
      status: "Paid",
      message: "Marked paid by cashier (manual verification).",
    }
  }

  async refund(): Promise<VerifyPaymentResult> {
    return {
      verified: false,
      status: "Failed",
      message: "Refunds are not supported for Manual UPI yet.",
    }
  }

  async cancel(payment: Payment): Promise<VerifyPaymentResult> {
    if (payment.status === "Paid") {
      return {
        verified: false,
        status: "Paid",
        message: "Cannot cancel a paid payment session.",
      }
    }
    return {
      verified: true,
      status: "Cancelled",
      message: "Payment session cancelled.",
    }
  }
}

export const manualUpiProvider = new ManualUPIProvider()
