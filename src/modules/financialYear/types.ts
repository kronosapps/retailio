/**
 * Financial year domain — shared by Utilities accounting & statutory views.
 */

export type FinancialYearStatus = "active" | "closed" | "draft"

export type FinancialYear = {
  id: string
  label: string
  startDate: string
  endDate: string
  status: FinancialYearStatus
  storeId: string | null
  createdAt: string
  updatedAt: string
}

export type CreateFinancialYearInput = {
  label: string
  startDate: string
  endDate: string
  storeId?: string | null
  makeActive?: boolean
}
