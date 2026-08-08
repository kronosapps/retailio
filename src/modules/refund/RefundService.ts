import type { RecordedSale } from "@/data/invoices"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { paisaToRupees } from "@/lib/money"
import { manualUpiProvider } from "@/modules/payment/providers/ManualUPIProvider"
import type { PaymentMethod } from "@/modules/payment/types"
import { inventoryRepository } from "@/repositories/InventoryRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import {
  refundRepository,
  type RefundRecord,
} from "@/repositories/RefundRepository"

export type ProcessRefundInput = {
  invoiceId: string
  reason: string
  /** How the money is returned to the customer. Defaults to original tender. */
  method?: PaymentMethod
  /** Return stock for matching inventory rows (best-effort). */
  restock?: boolean
  actorId?: string | null
  storeId?: string | null
}

export class RefundError extends Error {
  code:
    | "NOT_FOUND"
    | "NOT_PAID"
    | "ALREADY_REFUNDED"
    | "PROVIDER"
    | "UNKNOWN"

  constructor(code: RefundError["code"], message: string) {
    super(message)
    this.name = "RefundError"
    this.code = code
  }
}

/**
 * Refund business module.
 * UI → RefundService → repositories → EventBus → Sheets.
 * Never talks to Firestore or Sheets directly.
 */
export class RefundService {
  static list(): Promise<RefundRecord[]> {
    return refundRepository.list()
  }

  static getByInvoiceId(invoiceId: string): Promise<RefundRecord | null> {
    return refundRepository.getByInvoiceId(invoiceId)
  }

  static async process(input: ProcessRefundInput): Promise<RefundRecord> {
    const sale = await invoiceRepository.getById(input.invoiceId)
    if (!sale) {
      throw new RefundError("NOT_FOUND", "Invoice not found.")
    }

    if (sale.paymentStatus === "Refunded") {
      throw new RefundError(
        "ALREADY_REFUNDED",
        "This invoice has already been refunded."
      )
    }

    if (sale.paymentStatus !== "Paid") {
      throw new RefundError(
        "NOT_PAID",
        "Only paid invoices can be refunded."
      )
    }

    const existing = await refundRepository.getByInvoiceId(sale.invoiceId)
    if (existing) {
      throw new RefundError(
        "ALREADY_REFUNDED",
        "A refund already exists for this invoice."
      )
    }

    const payment = sale.paymentId
      ? await paymentRepository.getById(sale.paymentId)
      : null

    if (payment?.status === "Paid") {
      const verified = await manualUpiProvider.refund(
        payment,
        input.reason.trim()
      )
      if (!verified.verified || verified.status !== "Refunded") {
        throw new RefundError(
          "PROVIDER",
          verified.message || "Refund could not be verified."
        )
      }
    }

    const method: PaymentMethod =
      input.method || sale.paymentMethod || payment?.paymentMethod || "Cash"

    let restockedSkuCount = 0
    if (input.restock !== false) {
      restockedSkuCount = await restockSaleLines(sale, input.actorId ?? null)
    }

    const refund = await refundRepository.create({
      invoiceId: sale.invoiceId,
      paymentId: sale.paymentId ?? payment?.paymentId ?? null,
      customerId: sale.customerId ?? null,
      customerName: sale.customerName || "Walk-in",
      amountPaisa: sale.totals.total,
      method,
      reason: input.reason.trim() || "Customer refund",
      restock: input.restock !== false,
      restockedSkuCount,
      storeId: input.storeId ?? sale.storeId ?? null,
      lines: sale.lines.map((line) => ({
        itemId: line.itemId,
        name: line.name,
        weight: line.weight,
        qty: line.qty,
      })),
      createdBy: input.actorId ?? null,
    })

    await invoiceRepository.updatePaymentFields(sale.invoiceId, {
      paymentStatus: "Refunded",
      customerName: sale.customerName,
      customerId: sale.customerId,
      customerPhone: sale.customerPhone,
    })

    if (payment) {
      await paymentRepository.update(payment.paymentId, {
        status: "Refunded",
      })
    }

    await EventPublisher.publish(
      EventTypes.PAYMENT_REFUNDED,
      {
        invoiceId: sale.invoiceId,
        paymentId: refund.paymentId,
        customerId: sale.customerId ?? null,
        customerName: sale.customerName || "Walk-in",
        customerPhone: sale.customerPhone ?? null,
        amount: refund.amount,
        refundId: refund.refundId,
      },
      refund.storeId
    )

    return refund
  }

  static formatAmount(refund: RefundRecord): number {
    return refund.amount || paisaToRupees(refund.amountPaisa)
  }
}

async function restockSaleLines(
  sale: RecordedSale,
  actorId: string | null
): Promise<number> {
  const inventory = inventoryRepository.list()
  let count = 0

  for (const line of sale.lines) {
    if (line.isLoyaltyReward || line.qty <= 0) continue

    const match = inventory.find(
      (item) =>
        item.productId === line.itemId ||
        item.sku === line.itemId ||
        item.name.trim().toLowerCase() === line.name.trim().toLowerCase()
    )
    if (!match) continue

    await inventoryRepository.updateQuantity(
      match.id,
      match.quantity + line.qty,
      actorId
    )
    match.quantity += line.qty
    count += 1
  }

  return count
}
