import { getLocalCustomer } from "@/data/customers"
import { FinancialYearService } from "@/modules/financialYear"
import { StoreSettingsService } from "@/modules/notifications/services/StoreSettingsService"
import { formatPeriodLabel } from "@/modules/reporting/utils/report-periods"
import { isInRange } from "@/modules/reporting/utils/report-periods"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { env } from "@/core/config/env"

import type {
  Form27EqScaffold,
  GstPartyBucket,
  GstSummary,
  TcsReportScaffold,
} from "./types"

function isLikelyGstin(value: string | undefined | null): boolean {
  if (!value) return false
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(
    value.trim()
  )
}

/**
 * Statutory reports — operational scaffolds, never filing-ready in this pass.
 */
export class StatutoryService {
  static async getGstSummary(storeId?: string | null): Promise<GstSummary> {
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const invoices = (await invoiceRepository.list()).filter(
      (s) =>
        (s.paymentStatus === "Paid" || s.paymentStatus === "Refunded") &&
        isInRange(s.createdAt, start, end)
    )

    let taxablePaisa = 0
    let cgstPaisa = 0
    let sgstPaisa = 0
    let gstPaisa = 0
    const byRate = new Map<
      number,
      { taxablePaisa: number; cgstPaisa: number; sgstPaisa: number; gstPaisa: number }
    >()
    const byParty = new Map<
      GstPartyBucket,
      { invoiceCount: number; taxablePaisa: number; gstPaisa: number }
    >()

    for (const bucket of ["b2b", "b2c", "unclassified"] as GstPartyBucket[]) {
      byParty.set(bucket, { invoiceCount: 0, taxablePaisa: 0, gstPaisa: 0 })
    }

    for (const sale of invoices) {
      const taxable = sale.totals.taxableAmount || 0
      const cgst = sale.totals.cgstAmount || 0
      const sgst = sale.totals.sgstAmount || 0
      const gst = sale.totals.gstAmount || 0
      taxablePaisa += taxable
      cgstPaisa += cgst
      sgstPaisa += sgst
      gstPaisa += gst

      const rate = sale.totals.gstPercent || 0
      const rateCur = byRate.get(rate) || {
        taxablePaisa: 0,
        cgstPaisa: 0,
        sgstPaisa: 0,
        gstPaisa: 0,
      }
      rateCur.taxablePaisa += taxable
      rateCur.cgstPaisa += cgst
      rateCur.sgstPaisa += sgst
      rateCur.gstPaisa += gst
      byRate.set(rate, rateCur)

      const customer = sale.customerId
        ? getLocalCustomer(sale.customerId)
        : null
      const gstin = customer?.gstin
      let bucket: GstPartyBucket = "unclassified"
      if (isLikelyGstin(gstin)) bucket = "b2b"
      else if (customer && !gstin) bucket = "b2c"
      else if (!sale.customerId) bucket = "b2c"

      const party = byParty.get(bucket)!
      party.invoiceCount += 1
      party.taxablePaisa += taxable
      party.gstPaisa += gst
    }

    const missingFields = [
      "invoice.placeOfSupply",
      "invoice.igstAmount",
      "invoice.customerGstin (on document)",
      "creditNote.documentType",
    ]
    if (
      byParty.get("unclassified")!.invoiceCount > 0 ||
      byParty.get("b2b")!.invoiceCount === 0
    ) {
      missingFields.push("customer.gstin (for reliable B2B classification)")
    }

    return {
      periodLabel: formatPeriodLabel(start, end),
      taxablePaisa,
      cgstPaisa,
      sgstPaisa,
      igstPaisa: 0,
      gstPaisa,
      invoiceCount: invoices.length,
      byRate: [...byRate.entries()]
        .map(([rate, v]) => ({ rate, ...v }))
        .sort((a, b) => a.rate - b.rate),
      byParty: [...byParty.entries()].map(([bucket, v]) => ({
        bucket,
        ...v,
      })),
      meta: {
        filingReady: false,
        missingFields,
        notes: [
          "Operational GST summary from paid invoices — not GSTR filing-ready.",
          "No IGST / place-of-supply model yet.",
          "B2B requires customer.gstin; otherwise B2C or unclassified.",
          storeId ? `Store scope: ${storeId}` : "Store scope: all local invoices",
        ],
      },
    }
  }

  static async getTcsScaffold(storeId: string): Promise<TcsReportScaffold> {
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const settings = await StoreSettingsService.get(storeId)

    const missingFields = [
      "invoice.tcsRate",
      "invoice.tcsAmount",
      "party.pan",
      "tcs.challanNumber",
      "tcs.depositDate",
    ]
    if (!settings.tan) missingFields.push("storeSettings.tan")
    if (!settings.pan) missingFields.push("storeSettings.pan")
    if (!settings.tcsApplicable) missingFields.push("storeSettings.tcsApplicable")

    return {
      periodLabel: formatPeriodLabel(start, end),
      transactions: [],
      totalTcsPaisa: 0,
      meta: {
        filingReady: false,
        missingFields,
        notes: [
          "Operational scaffold — not statutory filing-ready.",
          "No TCS collection fields exist on invoices/payments yet.",
          settings.tcsApplicable
            ? "TCS applicability flag is enabled in Business Setup."
            : "Enable tcsApplicable in Business Setup when ready.",
        ],
      },
    }
  }

  static async getForm27EqScaffold(
    storeId: string
  ): Promise<Form27EqScaffold> {
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const settings = await StoreSettingsService.get(storeId)

    const missingFields = [
      "form27eq.collectionCode",
      "form27eq.bsrCode",
      "form27eq.challanNumber",
      "form27eq.depositDate",
      "party.pan",
      "tcs.transactions",
    ]
    if (!settings.tan) missingFields.push("storeSettings.tan")

    return {
      periodLabel: formatPeriodLabel(start, end),
      deductorTan: settings.tan || null,
      deductorName:
        settings.legalName ||
        settings.businessName ||
        env.banking.gstLegalName ||
        null,
      rows: [],
      meta: {
        filingReady: false,
        missingFields,
        notes: [
          "Form 27EQ scaffold only — not government filing-ready.",
          "Requires TCS transaction ledger + challan/deposit details.",
        ],
      },
    }
  }
}
