import type {
  CreateInvoiceInput,
  RecordedSale,
} from "@/data/invoices"
import { toPayableInvoice } from "@/data/invoices"
import { invoiceRepository } from "@/repositories/InvoiceRepository"

/**
 * Invoice business module.
 * Calls repositories only — never Firestore, Sheets, or fetch.
 */
export class InvoiceService {
  /** Create unpaid invoice (source of truth via repository). */
  static async create(input: CreateInvoiceInput): Promise<RecordedSale> {
    return invoiceRepository.save(input)
  }

  static toPayable(sale: RecordedSale) {
    return toPayableInvoice(sale)
  }
}
