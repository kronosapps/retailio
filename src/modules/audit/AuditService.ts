import {
  opsAuditRepository,
  type RecordOpsAuditInput,
} from "@/repositories/OpsAuditRepository"
import type { OpsAuditKind, OpsAuditRecord } from "./types"

export type AuditListFilter = {
  storeId?: string | null
  kind?: OpsAuditKind | "all"
  actorId?: string | null
  query?: string
  /** Inclusive ISO date (YYYY-MM-DD) or full ISO. */
  from?: string | null
  to?: string | null
  limit?: number
}

function formatRupees(paisa: number): string {
  return `₹${(Math.abs(paisa) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * UI → AuditService → OpsAuditRepository.
 * Prefer AuditEngine for domain events; call record() only when no event exists.
 */
export class AuditService {
  static list(filter: AuditListFilter = {}): OpsAuditRecord[] {
    let items = opsAuditRepository.list()
    if (filter.storeId) {
      items = items.filter(
        (r) => !r.storeId || r.storeId === filter.storeId
      )
    }
    if (filter.kind && filter.kind !== "all") {
      items = items.filter((r) => r.kind === filter.kind)
    }
    if (filter.actorId) {
      items = items.filter((r) => r.actorId === filter.actorId)
    }
    if (filter.from) {
      const from = filter.from.length <= 10 ? `${filter.from}T00:00:00.000Z` : filter.from
      items = items.filter((r) => r.createdAt >= from)
    }
    if (filter.to) {
      const to =
        filter.to.length <= 10 ? `${filter.to}T23:59:59.999Z` : filter.to
      items = items.filter((r) => r.createdAt <= to)
    }
    if (filter.query?.trim()) {
      const q = filter.query.trim().toLowerCase()
      items = items.filter(
        (r) =>
          r.message.toLowerCase().includes(q) ||
          (r.actorName || "").toLowerCase().includes(q) ||
          (r.actorId || "").toLowerCase().includes(q) ||
          (r.entityId || "").toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q)
      )
    }
    const limit = filter.limit ?? 500
    return items.slice(0, limit)
  }

  static hydrate() {
    return opsAuditRepository.hydrate()
  }

  static record(input: RecordOpsAuditInput) {
    return opsAuditRepository.append(input)
  }

  static formatRupees(paisa: number) {
    return formatRupees(paisa)
  }
}
