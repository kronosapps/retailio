import { useMemo, useState } from "react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button } from "@/components/ui/button"
import { InventoryService, InventoryError } from "@/modules/inventory"
import { StockAnalyticsService } from "@/modules/inventory/StockAnalyticsService"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type Section = "lots" | "expiry" | "reorder" | "health"

/**
 * Inventory → Lots & health — FEFO lots, expiry write-off, reorder, slow/dead.
 */
export function LotsHealthView() {
  const { userId, profile } = useAuth()
  const [section, setSection] = useState<Section>("expiry")
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lots = useMemo(() => {
    void tick
    return InventoryService.listLots().filter((l) => l.quantity > 0)
  }, [tick])

  const alerts = useMemo(() => {
    void tick
    return StockAnalyticsService.getExpiryAlerts(30)
  }, [tick])

  const reorder = useMemo(() => {
    void tick
    return StockAnalyticsService.getReorderSuggestions()
  }, [tick])

  const health = useMemo(() => {
    void tick
    return StockAnalyticsService.getStockHealth()
  }, [tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  async function onWriteOff(lotId: string) {
    setError(null)
    setBusy(true)
    try {
      await InventoryService.writeOffLot({
        lotId,
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      refresh()
    } catch (err) {
      setError(
        err instanceof InventoryError || err instanceof Error
          ? err.message
          : "Could not write off lot."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lots & health</h2>
        <p className="text-sm text-muted-foreground">
          FEFO batch lots, expiry alerts, reorder suggestions, and slow/dead
          stock.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {(
          [
            ["expiry", "Expiry"],
            ["lots", "Open lots"],
            ["reorder", "Reorder"],
            ["health", "Slow / dead"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "min-h-10 shrink-0 rounded-md px-3 text-sm font-medium",
              section === id
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {section === "expiry" ? (
        <div className="space-y-4">
          <SectionTitle
            title="Expired"
            count={alerts.expired.length}
          />
          <LotTable
            lots={alerts.expired}
            busy={busy}
            onWriteOff={onWriteOff}
            empty="No expired lots with remaining qty."
          />
          <SectionTitle
            title="Expiring within 30 days"
            count={alerts.expiringSoon.length}
          />
          <LotTable
            lots={alerts.expiringSoon}
            busy={busy}
            onWriteOff={onWriteOff}
            empty="Nothing expiring soon."
          />
        </div>
      ) : null}

      {section === "lots" ? (
        <LotTable
          lots={lots}
          busy={busy}
          onWriteOff={onWriteOff}
          empty="No open lots. Post a GRN or opening stock to create lots."
        />
      ) : null}

      {section === "reorder" ? (
        <ResponsiveList
          cards={
            reorder.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All items above reorder level.
              </p>
            ) : (
              reorder.map((r) => (
                <MobileListCard
                  key={r.sku}
                  title={r.name}
                  meta={
                    <>
                      <div className="font-mono text-xs">{r.sku}</div>
                      <div>
                        On hand {r.onHand} · Reorder at {r.reorderLevel} ·
                        Suggest {r.suggestedQty}
                      </div>
                    </>
                  }
                  badge={
                    <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">
                      {r.status}
                    </span>
                  }
                />
              ))
            )
          }
          table={
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">On hand</th>
                    <th className="px-3 py-2">Reorder</th>
                    <th className="px-3 py-2">Suggest</th>
                    <th className="px-3 py-2">Sold 30d</th>
                    <th className="px-3 py-2">Days cover</th>
                  </tr>
                </thead>
                <tbody>
                  {reorder.map((r) => (
                    <tr key={r.sku} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.sku}
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.onHand}</td>
                      <td className="px-3 py-2 tabular-nums">{r.reorderLevel}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">
                        {r.suggestedQty}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.soldLast30Days}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.daysCover ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {reorder.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        All items above reorder level.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {section === "health" ? (
        <ResponsiveList
          cards={
            health.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No slow or dead stock detected.
              </p>
            ) : (
              health.map((r) => (
                <MobileListCard
                  key={r.sku}
                  title={r.name}
                  meta={
                    <>
                      <div className="font-mono text-xs">{r.sku}</div>
                      <div>
                        On hand {r.onHand} · Sold 90d {r.soldLast90Days}
                      </div>
                    </>
                  }
                  badge={
                    <span
                      className={cn(
                        "rounded px-1.5 text-xs",
                        r.isDead
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-900"
                      )}
                    >
                      {r.isDead ? "Dead" : "Slow"}
                    </span>
                  }
                />
              ))
            )
          }
          table={
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">On hand</th>
                    <th className="px-3 py-2">Sold 90d</th>
                    <th className="px-3 py-2">Days cover</th>
                    <th className="px-3 py-2">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {health.map((r) => (
                    <tr key={r.sku} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-xs">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.onHand}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.soldLast90Days}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.daysCover ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.isDead ? "Dead" : "Slow"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="text-sm font-medium">
      {title}{" "}
      <span className="text-muted-foreground">({count})</span>
    </h3>
  )
}

function LotTable({
  lots,
  busy,
  onWriteOff,
  empty,
}: {
  lots: ReturnType<typeof InventoryService.listLots>
  busy: boolean
  onWriteOff: (id: string) => void
  empty: string
}) {
  return (
    <ResponsiveList
      cards={
        lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          lots.map((l) => (
            <MobileListCard
              key={l.id}
              title={l.productName}
              meta={
                <>
                  <div className="font-mono text-xs">
                    {l.lotNumber} · {l.sku}
                  </div>
                  <div>
                    Qty {l.quantity}
                    {l.expiryDate ? ` · Exp ${l.expiryDate}` : ""}
                    {l.batchCode ? ` · Batch ${l.batchCode}` : ""}
                  </div>
                </>
              }
              actions={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10"
                  disabled={busy}
                  onClick={() => onWriteOff(l.id)}
                >
                  Write off
                </Button>
              }
            />
          ))
        )
      }
      table={
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lot</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    {empty}
                  </td>
                </tr>
              ) : (
                lots.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.lotNumber}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.productName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {l.sku}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{l.quantity}</td>
                    <td className="px-3 py-2 text-xs">{l.expiryDate || "—"}</td>
                    <td className="px-3 py-2 text-xs">{l.batchCode || "—"}</td>
                    <td className="px-3 py-2 text-xs">{l.sourceType}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onWriteOff(l.id)}
                      >
                        Write off
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      }
    />
  )
}
