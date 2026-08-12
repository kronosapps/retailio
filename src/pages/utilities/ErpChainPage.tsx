import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ERP_CHAIN } from "@/modules/integration"
import { ErpChainStatusService } from "@/modules/integration/ErpChainStatusService"
import { cn } from "@/lib/utils"

function formatWhen(iso: string | null) {
  if (!iso) return "—"
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

function activityLabel(activity: "active" | "idle" | "consumer") {
  if (activity === "active") return "Seen"
  if (activity === "consumer") return "Consumer"
  return "No events yet"
}

/**
 * Utilities → ERP chain — stage map, health counts, recent domain events.
 */
export function ErpChainPage() {
  const [tick, setTick] = useState(0)

  const stages = useMemo(() => {
    void tick
    return ErpChainStatusService.getStageActivity()
  }, [tick])

  const health = useMemo(() => {
    void tick
    return ErpChainStatusService.getHealth()
  }, [tick])

  const recent = useMemo(() => {
    void tick
    return ErpChainStatusService.listRecentChainEvents(30)
  }, [tick])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">ERP chain</h2>
          <p className="text-sm text-muted-foreground">
            Purchase → Inventory → Sales → Banking → Accounting. Status from
            domain event log and posted journals — engines subscribe; UI never
            writes GL.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTick((n) => n + 1)}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {ERP_CHAIN.map((s) => s.label).join(" → ")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Posted journals" value={String(health.postedJournals)} />
        <Metric label="Sale journals" value={String(health.saleJournals)} />
        <Metric
          label="Purchase invoices (GL)"
          value={String(health.purchaseInvoiceJournals)}
        />
        <Metric
          label="Stock movement journals"
          value={String(health.inventoryMovementJournals)}
        />
        <Metric label="Banking ledger rows" value={String(health.bankingEntries)} />
        <Metric label="SKUs in stock" value={String(health.skusInStock)} />
        <Metric
          label="Chain events (log)"
          value={String(health.recentChainEvents)}
        />
        <div className="rounded-lg border px-3 py-2 text-sm">
          <p className="text-muted-foreground">Quick links</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <Link className="underline-offset-2 hover:underline" to="/purchasing">
              Purchasing
            </Link>
            <Link className="underline-offset-2 hover:underline" to="/inventory">
              Inventory
            </Link>
            <Link className="underline-offset-2 hover:underline" to="/banking">
              Banking
            </Link>
            <Link
              className="underline-offset-2 hover:underline"
              to="/utilities/trial-balance"
            >
              Trial balance
            </Link>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Stages
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last event</th>
                <th className="px-3 py-2">24h</th>
                <th className="px-3 py-2">Consumers</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(({ stage, activity, lastEventAt, lastEventType, eventCount24h }) => (
                <tr key={stage.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{stage.label}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
                        activity === "active" &&
                          "bg-emerald-500/15 text-emerald-800",
                        activity === "idle" && "bg-muted text-muted-foreground",
                        activity === "consumer" &&
                          "bg-sky-500/15 text-sky-900"
                      )}
                    >
                      {activityLabel(activity)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">
                      {lastEventType || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatWhen(lastEventAt)}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{eventCount24h}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {stage.consumers.length
                      ? stage.consumers.join(", ")
                      : "—"}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2 text-xs text-muted-foreground">
                    {stage.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Recent chain events
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Event id</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No chain events in the local audit log yet. Run a purchase,
                    GRN, or POS sale to populate.
                  </td>
                </tr>
              ) : (
                recent.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatWhen(e.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.type}</td>
                    <td className="px-3 py-2">{e.status}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {e.eventId}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
