/**
 * GST / Tax-Correct Billing — Service layer.
 * UI → GstService → tax engine + repositories (never Firestore from React).
 */

import { getLocalCustomer } from "@/data/customers"
import {
  getGstSettings,
  isValidGstinFormat,
  saveGstSettings,
  stateCodeFromGstin,
  type GstSettings,
} from "@/data/gstSettings"
import {
  listGstTaxDocuments,
  upsertGstTaxDocument,
} from "@/data/gstTaxDocuments"
import { getRecordedSale } from "@/data/invoices"
import { FinancialYearService } from "@/modules/financialYear"
import { formatPeriodLabel, isInRange } from "@/modules/reporting/utils/report-periods"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { createId } from "@/utils/id"

import {
  halfRate,
  resolvePartyType,
  resolvePlaceOfSupply,
  resolveSupplyType,
  taxPricedLines,
} from "./taxEngine"
import {
  GST_FILING_PLACEHOLDERS,
  type GstBillingReport,
  type GstFilingPlaceholder,
  type GstTaxDocument,
  type GstTaxDocumentLine,
  type HsnRateBucket,
  type LineTaxSnapshot,
  type OrderTaxSummary,
} from "./types"

export class GstError extends Error {
  code: "VALIDATION" | "NOT_FOUND"

  constructor(code: GstError["code"], message: string) {
    super(message)
    this.name = "GstError"
    this.code = code
  }
}

/**
 * Tax-correct billing facade: engine, settings, tax CN/DN, reports, placeholders.
 */
export class GstService {
  static getSettings(): GstSettings {
    return getGstSettings()
  }

  static saveSettings(patch: Partial<GstSettings>): GstSettings {
    return saveGstSettings(patch)
  }

  static filingPlaceholders(): GstFilingPlaceholder[] {
    return GST_FILING_PLACEHOLDERS
  }

  static halfRate(gstRate: number) {
    return halfRate(gstRate)
  }

  static resolvePartyType(customerGstin?: string | null) {
    return resolvePartyType(customerGstin)
  }

  static resolveSupplyType(customerStateCode?: string | null) {
    return resolveSupplyType(customerStateCode)
  }

  static taxLines(
    lines: {
      netLinePaisa: number
      gstRate?: number | null
      hsnCode?: string | null
      sacCode?: string | null
      isLoyaltyReward?: boolean
    }[],
    ctx?: {
      customerGstin?: string | null
      customerStateCode?: string | null
    }
  ): { lineTaxes: LineTaxSnapshot[]; summary: OrderTaxSummary } {
    return taxPricedLines(lines, ctx)
  }

  /** Operational + HSN GST report for the active financial year. */
  static async getBillingReport(
    storeId?: string | null
  ): Promise<GstBillingReport> {
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const settings = getGstSettings()
    const invoices = (await invoiceRepository.list()).filter(
      (s) =>
        (s.paymentStatus === "Paid" || s.paymentStatus === "Refunded") &&
        isInRange(s.createdAt, start, end) &&
        (!storeId || !s.storeId || s.storeId === storeId)
    )

    let taxablePaisa = 0
    let cgstPaisa = 0
    let sgstPaisa = 0
    let igstPaisa = 0
    let gstPaisa = 0

    const byRate = new Map<
      number,
      {
        taxablePaisa: number
        cgstPaisa: number
        sgstPaisa: number
        igstPaisa: number
        gstPaisa: number
      }
    >()
    const byHsn = new Map<string, HsnRateBucket>()
    const byParty = new Map<
      "B2B" | "B2C" | "unclassified",
      { invoiceCount: number; taxablePaisa: number; gstPaisa: number }
    >([
      ["B2B", { invoiceCount: 0, taxablePaisa: 0, gstPaisa: 0 }],
      ["B2C", { invoiceCount: 0, taxablePaisa: 0, gstPaisa: 0 }],
      ["unclassified", { invoiceCount: 0, taxablePaisa: 0, gstPaisa: 0 }],
    ])

    let linesMissingHsn = 0
    let invoicesMissingGstinOnB2bHint = 0

    for (const sale of invoices) {
      const saleIgst = sale.totals.igstAmount || 0
      const saleTaxable = sale.totals.taxableAmount || 0
      const saleCgst = sale.totals.cgstAmount || 0
      const saleSgst = sale.totals.sgstAmount || 0
      const saleGst = sale.totals.gstAmount || saleCgst + saleSgst + saleIgst

      taxablePaisa += saleTaxable
      cgstPaisa += saleCgst
      sgstPaisa += saleSgst
      igstPaisa += saleIgst
      gstPaisa += saleGst

      const hasLineTax = sale.lines.some((l) => l.taxSnapshot)

      if (hasLineTax) {
        for (const line of sale.lines) {
          const t = line.taxSnapshot
          if (!t) continue
          if (!t.hsnCode && !t.sacCode && t.taxablePaisa > 0) {
            linesMissingHsn += 1
          }
          const rate = t.gstRate || 0
          const rateCur = byRate.get(rate) || {
            taxablePaisa: 0,
            cgstPaisa: 0,
            sgstPaisa: 0,
            igstPaisa: 0,
            gstPaisa: 0,
          }
          rateCur.taxablePaisa += t.taxablePaisa
          rateCur.cgstPaisa += t.cgstPaisa
          rateCur.sgstPaisa += t.sgstPaisa
          rateCur.igstPaisa += t.igstPaisa
          rateCur.gstPaisa += t.gstPaisa
          byRate.set(rate, rateCur)

          const hsnKey = `${t.hsnCode || t.sacCode || "UNMAPPED"}|${rate}`
          const hsnCur = byHsn.get(hsnKey) || {
            hsnCode: t.hsnCode || t.sacCode || "UNMAPPED",
            gstRate: rate,
            taxablePaisa: 0,
            cgstPaisa: 0,
            sgstPaisa: 0,
            igstPaisa: 0,
            gstPaisa: 0,
            lineCount: 0,
          }
          hsnCur.taxablePaisa += t.taxablePaisa
          hsnCur.cgstPaisa += t.cgstPaisa
          hsnCur.sgstPaisa += t.sgstPaisa
          hsnCur.igstPaisa += t.igstPaisa
          hsnCur.gstPaisa += t.gstPaisa
          hsnCur.lineCount += 1
          byHsn.set(hsnKey, hsnCur)
        }
      } else {
        const rate = sale.totals.gstPercent || settings.defaultGstRate
        const rateCur = byRate.get(rate) || {
          taxablePaisa: 0,
          cgstPaisa: 0,
          sgstPaisa: 0,
          igstPaisa: 0,
          gstPaisa: 0,
        }
        rateCur.taxablePaisa += saleTaxable
        rateCur.cgstPaisa += saleCgst
        rateCur.sgstPaisa += saleSgst
        rateCur.igstPaisa += saleIgst
        rateCur.gstPaisa += saleGst
        byRate.set(rate, rateCur)
      }

      const customer = sale.customerId
        ? getLocalCustomer(sale.customerId)
        : null
      const docGstin = sale.tax?.customerGstin || customer?.gstin
      let bucket: "B2B" | "B2C" | "unclassified" = "unclassified"
      if (sale.tax?.partyType === "B2B" || isValidGstinFormat(docGstin)) {
        bucket = "B2B"
      } else if (sale.tax?.partyType === "B2C" || customer || !sale.customerId) {
        bucket = "B2C"
      }
      if (bucket === "B2B" && !isValidGstinFormat(docGstin)) {
        invoicesMissingGstinOnB2bHint += 1
      }

      const party = byParty.get(bucket)!
      party.invoiceCount += 1
      party.taxablePaisa += saleTaxable
      party.gstPaisa += saleGst
    }

    const taxDocs = listGstTaxDocuments().filter((d) =>
      isInRange(d.createdAt, start, end)
    )
    const taxCreditNotes = taxDocs.filter(
      (d) => d.documentType === "CREDIT_NOTE" && d.status === "ISSUED"
    ).length
    const taxDebitNotes = taxDocs.filter(
      (d) => d.documentType === "DEBIT_NOTE" && d.status === "ISSUED"
    ).length

    const missingFields: string[] = []
    if (linesMissingHsn > 0) {
      missingFields.push(`line.hsnCode (${linesMissingHsn} lines)`)
    }
    if (!settings.storeGstin) missingFields.push("store.gstin")
    if (!settings.storeStateCode) missingFields.push("store.stateCode")
    if (invoicesMissingGstinOnB2bHint > 0) {
      missingFields.push("invoice.customerGstin (B2B)")
    }

    return {
      periodLabel: formatPeriodLabel(start, end),
      pricingMode: settings.pricingMode,
      taxablePaisa,
      cgstPaisa,
      sgstPaisa,
      igstPaisa,
      gstPaisa,
      invoiceCount: invoices.length,
      byRate: [...byRate.entries()]
        .map(([rate, v]) => ({ rate, ...v }))
        .sort((a, b) => a.rate - b.rate),
      byHsn: [...byHsn.values()].sort((a, b) =>
        a.hsnCode.localeCompare(b.hsnCode)
      ),
      byParty: [...byParty.entries()].map(([bucket, v]) => ({
        bucket,
        ...v,
      })),
      taxCreditNotes,
      taxDebitNotes,
      meta: {
        filingReady: false,
        notes: [
          "Tax engine applies product GST rates / HSN on new sales.",
          "Legacy invoices may only have order-level GST breakout.",
          "GSTR-1 / GSTR-3B / e-invoice / e-way bill are placeholders until data is complete.",
        ],
        missingFields,
      },
      placeholders: GST_FILING_PLACEHOLDERS,
    }
  }

  static issueTaxNote(input: {
    documentType: "CREDIT_NOTE" | "DEBIT_NOTE"
    referenceInvoiceId: string
    reason?: string | null
    /** Full reverse (default) or custom lines. */
    lines?: GstTaxDocumentLine[]
    storeCreditNoteId?: string | null
    actorId?: string | null
    storeId?: string | null
  }): GstTaxDocument {
    const invoice = getRecordedSale(input.referenceInvoiceId)
    if (!invoice) {
      throw new GstError("NOT_FOUND", "Reference invoice not found.")
    }

    const customer = invoice.customerId
      ? getLocalCustomer(invoice.customerId)
      : null
    const customerGstin =
      invoice.tax?.customerGstin || customer?.gstin || null
    const partyType =
      invoice.tax?.partyType || resolvePartyType(customerGstin)
    const placeOfSupply =
      invoice.tax?.placeOfSupply ||
      resolvePlaceOfSupply(stateCodeFromGstin(customerGstin), customerGstin)
    const supplyType =
      invoice.tax?.supplyType ||
      resolveSupplyType(stateCodeFromGstin(customerGstin))
    const pricingMode =
      invoice.tax?.pricingMode || getGstSettings().pricingMode

    let lines: GstTaxDocumentLine[] = input.lines || []
    if (!lines.length) {
      lines = invoice.lines
        .filter((l) => !l.isLoyaltyReward && (l.lineTotalPaisa || 0) > 0)
        .map((l) => {
          const t = l.taxSnapshot
          if (t) {
            return {
              sku: l.sku || null,
              name: l.name,
              hsnCode: t.hsnCode,
              sacCode: t.sacCode,
              qty: l.qty,
              gstRate: t.gstRate,
              taxablePaisa: t.taxablePaisa,
              cgstPaisa: t.cgstPaisa,
              sgstPaisa: t.sgstPaisa,
              igstPaisa: t.igstPaisa,
              lineTotalPaisa: t.lineTotalPaisa,
            }
          }
          // Fallback: reverse using order-level rate on line net (legacy invoices)
          const { lineTaxes } = taxPricedLines(
            [
              {
                netLinePaisa: l.lineTotalPaisa,
                gstRate: invoice.totals.gstPercent,
                isLoyaltyReward: false,
              },
            ],
            { customerGstin }
          )
          const snap = lineTaxes[0]
          return {
            sku: l.sku || null,
            name: l.name,
            hsnCode: null,
            sacCode: null,
            qty: l.qty,
            gstRate: snap.gstRate,
            taxablePaisa: snap.taxablePaisa,
            cgstPaisa: snap.cgstPaisa,
            sgstPaisa: snap.sgstPaisa,
            igstPaisa: snap.igstPaisa,
            lineTotalPaisa: snap.lineTotalPaisa,
          }
        })
    }

    const taxablePaisa = lines.reduce((s, l) => s + l.taxablePaisa, 0)
    const cgstPaisa = lines.reduce((s, l) => s + l.cgstPaisa, 0)
    const sgstPaisa = lines.reduce((s, l) => s + l.sgstPaisa, 0)
    const igstPaisa = lines.reduce((s, l) => s + l.igstPaisa, 0)
    const gstPaisa = cgstPaisa + sgstPaisa + igstPaisa
    const totalPaisa = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)

    const prefix = input.documentType === "CREDIT_NOTE" ? "TXN-CN" : "TXN-DN"
    const now = new Date().toISOString()
    const doc: GstTaxDocument = {
      id: createId("gstdoc"),
      documentType: input.documentType,
      documentNumber: `${prefix}-${Date.now().toString(36).toUpperCase()}`,
      status: "ISSUED",
      referenceInvoiceId: input.referenceInvoiceId,
      storeCreditNoteId: input.storeCreditNoteId ?? null,
      customerId: invoice.customerId ?? null,
      customerName: invoice.customerName || customer?.name || "Customer",
      customerGstin,
      partyType,
      placeOfSupply,
      supplyType,
      pricingMode,
      reason: input.reason?.trim() || null,
      lines,
      taxablePaisa,
      cgstPaisa,
      sgstPaisa,
      igstPaisa,
      gstPaisa,
      totalPaisa,
      storeId: input.storeId ?? invoice.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
    }

    return upsertGstTaxDocument(doc)
  }

  static listTaxDocuments(): GstTaxDocument[] {
    return listGstTaxDocuments()
  }
}
