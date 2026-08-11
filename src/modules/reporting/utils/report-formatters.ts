import { formatMoney, paisaToRupees, type Paisa } from "@/lib/money"
import { env } from "@/core/config/env"

export function reportStoreName(): string {
  return env.banking.gstTradeName || env.banking.accountName || "RetailOS Store"
}

export function formatReportMoney(paisa: Paisa): string {
  return formatMoney(paisa)
}

export function paisaAsRupeesNumber(paisa: Paisa): number {
  return Number(paisaToRupees(paisa).toFixed(2))
}

export function formatReportDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export function formatReportTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function percentChange(
  current: number,
  previous: number
): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
