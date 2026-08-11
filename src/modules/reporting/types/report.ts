/** Shared reporting domain types — read-only analytical projections. */

import type { PaymentMethod } from "@/modules/payment/types"

export const REPORT_TYPES = [
  "sales",
  "inventory",
  "stock",
  "items",
  "dashboard",
  "utility",
] as const

export type ReportType = (typeof REPORT_TYPES)[number]

export type ReportPeriodPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "custom"

export type ReportFilters = {
  preset: ReportPeriodPreset
  startDate: Date
  endDate: Date
  storeId?: string | null
  category?: string | null
  productSku?: string | null
  staffId?: string | null
  paymentMethod?: PaymentMethod | null
}

export type ReportSheet = {
  name: string
  columns: string[]
  rows: Array<Array<string | number | boolean | null>>
}

export type ReportExportPayload = {
  reportType: ReportType
  title: string
  storeName: string
  generatedAt: string
  periodLabel: string
  filters: {
    preset: ReportPeriodPreset
    startDate: string
    endDate: string
    storeId: string | null
    category: string | null
    productSku: string | null
    staffId: string | null
    paymentMethod: string | null
  }
  sheets: ReportSheet[]
}

export type ReportResult<TSummary, TRow> = {
  reportType: ReportType
  generatedAt: string
  filters: ReportFilters
  periodLabel: string
  storeName: string
  summary: TSummary
  rows: TRow[]
  /** Extra breakdown tables for multi-sheet export */
  breakdowns?: Record<string, ReportSheet>
}

export type NamedAmount = {
  name: string
  amountPaisa: number
  count?: number
}
