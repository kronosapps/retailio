/**
 * Statutory reporting domain scaffold.
 * filingReady is always false until full GSTR/TCS data models exist.
 */

export type StatutoryReportMeta = {
  filingReady: false
  missingFields: string[]
  notes: string[]
}

export type GstPartyBucket = "b2b" | "b2c" | "unclassified"

export type GstRateBreakup = {
  rate: number
  taxablePaisa: number
  cgstPaisa: number
  sgstPaisa: number
  gstPaisa: number
}

export type GstPartyBreakup = {
  bucket: GstPartyBucket
  invoiceCount: number
  taxablePaisa: number
  gstPaisa: number
}

export type GstSummary = {
  periodLabel: string
  taxablePaisa: number
  cgstPaisa: number
  sgstPaisa: number
  igstPaisa: number
  gstPaisa: number
  invoiceCount: number
  byRate: GstRateBreakup[]
  byParty: GstPartyBreakup[]
  meta: StatutoryReportMeta
}

export type TcsTransaction = {
  id: string
  date: string
  partyName: string
  partyPan: string | null
  collecteeTan: string | null
  taxablePaisa: number
  tcsRatePercent: number | null
  tcsAmountPaisa: number | null
  challanNumber: string | null
  depositDate: string | null
  status: "incomplete" | "recorded"
}

export type TcsReportScaffold = {
  periodLabel: string
  transactions: TcsTransaction[]
  totalTcsPaisa: number
  meta: StatutoryReportMeta
}

export type Form27EqRow = {
  serial: number
  partyName: string
  partyPan: string | null
  amountPaidPaisa: number | null
  tcsCollectedPaisa: number | null
  collectionCode: string | null
  challanNumber: string | null
  bsrCode: string | null
  depositDate: string | null
}

export type Form27EqScaffold = {
  periodLabel: string
  deductorTan: string | null
  deductorName: string | null
  rows: Form27EqRow[]
  meta: StatutoryReportMeta
}
