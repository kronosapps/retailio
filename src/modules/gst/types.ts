/**
 * GST domain types — line tax snapshots, documents, filing placeholders.
 */

import type { Paisa } from "@/lib/money"
import type {
  GstPartyType,
  GstPricingMode,
  GstSupplyType,
} from "@/data/gstSettings"

export type { GstPartyType, GstPricingMode, GstSupplyType }

/** Frozen per sale line — do not recompute from today's catalog. */
export type LineTaxSnapshot = {
  hsnCode: string | null
  /** SAC when service line (placeholder for future services). */
  sacCode: string | null
  gstRate: number
  pricingMode: GstPricingMode
  supplyType: GstSupplyType
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  /** CGST+SGST or IGST. */
  gstPaisa: Paisa
  /** Inclusive line total or exclusive+tax depending on mode. */
  lineTotalPaisa: Paisa
}

export type OrderTaxSummary = {
  pricingMode: GstPricingMode
  supplyType: GstSupplyType
  partyType: GstPartyType
  placeOfSupply: string
  customerGstin: string | null
  storeGstin: string | null
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  gstPaisa: Paisa
  /** Payable (inclusive total, or exclusive+tax). */
  totalPaisa: Paisa
  /** Distinct rates present on the order. */
  ratesUsed: number[]
}

export type GstDocumentType =
  | "TAX_INVOICE"
  | "BILL_OF_SUPPLY"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"

export type GstTaxDocumentStatus = "DRAFT" | "ISSUED" | "CANCELLED"

export type GstTaxDocumentLine = {
  sku: string | null
  name: string
  hsnCode: string | null
  sacCode: string | null
  qty: number
  gstRate: number
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  lineTotalPaisa: Paisa
}

/**
 * Tax-correct credit / debit note (distinct from CRM store-credit notes).
 * Linked to original tax invoice when available.
 */
export type GstTaxDocument = {
  id: string
  documentType: GstDocumentType
  documentNumber: string
  status: GstTaxDocumentStatus
  referenceInvoiceId: string | null
  /** CRM store-credit note id when settlement creates both. */
  storeCreditNoteId: string | null
  customerId: string | null
  customerName: string
  customerGstin: string | null
  partyType: GstPartyType
  placeOfSupply: string
  supplyType: GstSupplyType
  pricingMode: GstPricingMode
  reason: string | null
  lines: GstTaxDocumentLine[]
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  gstPaisa: Paisa
  totalPaisa: Paisa
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

/** Filing / compliance features — scaffold only until data is correct. */
export type GstFilingPlaceholderId =
  | "GSTR_1"
  | "GSTR_3B"
  | "E_INVOICE"
  | "E_WAY_BILL"

export type GstFilingPlaceholder = {
  id: GstFilingPlaceholderId
  title: string
  description: string
  status: "PLANNED" | "NOT_STARTED"
  prerequisites: string[]
}

export const GST_FILING_PLACEHOLDERS: GstFilingPlaceholder[] = [
  {
    id: "GSTR_1",
    title: "GSTR-1",
    description:
      "Outward supplies return — B2B invoices, B2C summary, credit/debit notes, HSN.",
    status: "PLANNED",
    prerequisites: [
      "Line-level HSN and GST rates on every invoice",
      "Customer GSTIN on B2B tax invoices",
      "Place of supply + IGST for interstate",
      "Tax credit/debit notes linked to original invoices",
    ],
  },
  {
    id: "GSTR_3B",
    title: "GSTR-3B",
    description:
      "Monthly summary return — outward tax, input tax credit, payment.",
    status: "PLANNED",
    prerequisites: [
      "GSTR-1 data quality",
      "Purchase invoice input GST (ITC) reconciled",
      "GST payable ledger from accounting",
    ],
  },
  {
    id: "E_INVOICE",
    title: "E-Invoice",
    description:
      "IRN + QR via Invoice Registration Portal (when turnover threshold applies).",
    status: "NOT_STARTED",
    prerequisites: [
      "Stable tax invoice JSON schema",
      "NIC / IRP credentials",
      "B2B party master with GSTIN validation",
    ],
  },
  {
    id: "E_WAY_BILL",
    title: "E-Way Bill",
    description:
      "Movement of goods — distance, transporter, vehicle (when required).",
    status: "NOT_STARTED",
    prerequisites: [
      "Dispatch / delivery address on invoice",
      "Transporter master",
      "Value/threshold rules by supply type",
    ],
  },
]

export type HsnRateBucket = {
  hsnCode: string
  gstRate: number
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  gstPaisa: Paisa
  lineCount: number
}

export type GstBillingReport = {
  periodLabel: string
  pricingMode: GstPricingMode
  taxablePaisa: Paisa
  cgstPaisa: Paisa
  sgstPaisa: Paisa
  igstPaisa: Paisa
  gstPaisa: Paisa
  invoiceCount: number
  byRate: {
    rate: number
    taxablePaisa: Paisa
    cgstPaisa: Paisa
    sgstPaisa: Paisa
    igstPaisa: Paisa
    gstPaisa: Paisa
  }[]
  byHsn: HsnRateBucket[]
  byParty: {
    bucket: GstPartyType | "unclassified"
    invoiceCount: number
    taxablePaisa: Paisa
    gstPaisa: Paisa
  }[]
  taxCreditNotes: number
  taxDebitNotes: number
  meta: {
    filingReady: false
    notes: string[]
    missingFields: string[]
  }
  placeholders: GstFilingPlaceholder[]
}
