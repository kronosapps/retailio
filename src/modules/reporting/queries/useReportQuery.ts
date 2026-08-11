import { useQuery } from "@tanstack/react-query"

import type { ReportFilters, ReportType } from "../types/report"
import type { ItemSort } from "../services/ItemReportService"
import { ReportingService } from "../services/ReportingService"

export function reportQueryKey(
  type: ReportType,
  filters: ReportFilters,
  sort?: ItemSort
) {
  return [
    "reporting",
    type,
    filters.preset,
    filters.startDate.toISOString(),
    filters.endDate.toISOString(),
    filters.storeId ?? null,
    filters.category ?? null,
    filters.productSku ?? null,
    filters.staffId ?? null,
    filters.paymentMethod ?? null,
    sort ?? null,
  ] as const
}

export function useReportQuery(
  type: ReportType,
  filters: ReportFilters,
  enabled: boolean,
  sort?: ItemSort
) {
  return useQuery({
    queryKey: reportQueryKey(type, filters, sort),
    queryFn: () => ReportingService.generate(type, filters, sort),
    enabled,
    staleTime: 30_000,
  })
}
