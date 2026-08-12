import { useEffect, useMemo, useState } from "react"
import { ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { cn } from "@/lib/utils"
import {
  AuditService,
  OPS_AUDIT_KIND_LABELS,
  OPS_AUDIT_KINDS,
  type OpsAuditKind,
  type OpsAuditRecord,
} from "@/modules/audit"
import { useAuth } from "@/providers/AuthProvider"

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function kindTone(kind: OpsAuditKind): string {
  if (kind === "LOGIN_FAILED") return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-50"
  if (kind === "REFUND" || kind === "DISCOUNT_APPLIED") {
    return "border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-50"
  }
  if (kind === "PRICE_CHANGED" || kind === "STOCK_ADJUSTED") {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50"
  }
  if (kind === "LOGIN_SUCCESS" || kind === "LOGOUT") {
    return "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700/50 dark:bg-slate-900/40 dark:text-slate-50"
  }
  return "border-border bg-card text-card-foreground"
}

/**
 * Utilities → Audit log — who changed price, stock, discounts, refunds, …
 */
export function AuditLogPage() {
  const { profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [kind, setKind] = useState<OpsAuditKind | "all">("all")
  const [query, setQuery] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void AuditService.hydrate().then(() => setTick((t) => t + 1))
  }, [])

  const rows = useMemo(() => {
    void tick
    return AuditService.list({
      storeId: profile?.storeId ?? null,
      kind,
      query,
      from: from || null,
      to: to || null,
      limit: 400,
    })
  }, [tick, profile?.storeId, kind, query, from, to])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="size-6" />
            Audit log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Traceable store mutations — login, prices, stock, discounts,
            refunds, banking, staff, and settings.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void AuditService.hydrate()
              .then(() => setTick((t) => t + 1))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="audit-kind">Kind</Label>
          <select
            id="audit-kind"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as OpsAuditKind | "all")
            }
          >
            <option value="all">All kinds</option>
            {OPS_AUDIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {OPS_AUDIT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-q">Search</Label>
          <Input
            id="audit-q"
            placeholder="Actor, SKU, invoice…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} event{rows.length === 1 ? "" : "s"}
      </p>

      <ResponsiveList
        cards={
          rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No audit events yet. Logins, price changes, stock adjustments,
              discounts, and refunds will appear here.
            </p>
          ) : (
            rows.map((row) => <AuditCard key={row.id} row={row} />)
          )
        }
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Entity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          kindTone(row.kind)
                        )}
                      >
                        {OPS_AUDIT_KIND_LABELS[row.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.actorName || row.actorId || "—"}
                    </td>
                    <td className="px-3 py-2">{row.message}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.entityId || "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      No audit events yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
      />
    </div>
  )
}

function AuditCard({ row }: { row: OpsAuditRecord }) {
  return (
    <MobileListCard
      title={row.message}
      meta={
        <>
          <div>{formatWhen(row.createdAt)}</div>
          <div>
            {row.actorName || row.actorId || "Unknown actor"}
            {row.entityId ? ` · ${row.entityId}` : ""}
          </div>
        </>
      }
      badge={
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
            kindTone(row.kind)
          )}
        >
          {OPS_AUDIT_KIND_LABELS[row.kind]}
        </span>
      }
    />
  )
}
