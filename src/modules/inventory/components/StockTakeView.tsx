import { useMemo, useState } from "react"
import { ClipboardList } from "lucide-react"

import { ResponsiveList } from "@/components/ResponsiveList"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  StockTakeError,
  StockTakeService,
  type StockTakeRecord,
} from "@/modules/inventory/StockTakeService"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

/**
 * Inventory → Stock take — physical count → variance → post adjustments.
 */
export function StockTakeView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const takes = useMemo(() => {
    void tick
    return StockTakeService.list()
  }, [tick])

  const active = useMemo(() => {
    void tick
    return activeId ? StockTakeService.getById(activeId) : null
  }, [activeId, tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  async function onStart() {
    setError(null)
    setBusy(true)
    try {
      const draft = await StockTakeService.startDraft({
        storeId: profile?.storeId ?? null,
        actorId: userId,
      })
      setActiveId(draft.id)
      refresh()
    } catch (err) {
      setError(
        err instanceof StockTakeError || err instanceof Error
          ? err.message
          : "Could not start stock take."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onCountChange(sku: string, countedQty: string) {
    if (!active || active.status !== "DRAFT") return
    const n = Number(countedQty)
    if (!Number.isFinite(n) || n < 0) return
    await StockTakeService.updateCounts(
      active.id,
      [{ sku, countedQty: n }],
      userId
    )
    refresh()
  }

  async function onPost() {
    if (!active) return
    setError(null)
    setBusy(true)
    try {
      await StockTakeService.post(active.id, {
        actorId: userId,
        actorName: profile?.displayName ?? profile?.username ?? null,
      })
      refresh()
    } catch (err) {
      setError(
        err instanceof StockTakeError || err instanceof Error
          ? err.message
          : "Could not post stock take."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Stock take</h2>
          <p className="text-sm text-muted-foreground">
            Count physical stock, review variance (counted − system), then post
            to apply ADJUSTMENT_IN / ADJUSTMENT_OUT and update lots.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void onStart()}>
          <ClipboardList className="size-4" />
          New count
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sessions</Label>
          <ResponsiveList
            cards={
              takes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock takes yet.</p>
              ) : (
                takes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border p-3 text-left text-sm",
                      activeId === t.id && "border-foreground"
                    )}
                    onClick={() => setActiveId(t.id)}
                  >
                    <div className="font-mono text-xs">{t.takeNumber}</div>
                    <StatusBadge status={t.status} />
                  </button>
                ))
              )
            }
            table={
              <ul className="space-y-1">
                {takes.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm",
                        activeId === t.id && "bg-muted"
                      )}
                      onClick={() => setActiveId(t.id)}
                    >
                      <span className="font-mono text-xs">{t.takeNumber}</span>
                      <StatusBadge status={t.status} />
                    </button>
                  </li>
                ))}
              </ul>
            }
          />
        </div>

        <div className="space-y-3">
          {!active ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              Select a session or start a new count.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-sm">{active.takeNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {active.lines.filter((l) => l.varianceQty !== 0).length}{" "}
                    variance line(s)
                  </div>
                </div>
                {active.status === "DRAFT" ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void onPost()}
                  >
                    {busy ? "Posting…" : "Post variances"}
                  </Button>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">System</th>
                      <th className="px-3 py-2">Counted</th>
                      <th className="px-3 py-2">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.lines.map((line) => (
                      <tr key={line.sku} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">{line.sku}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.productName}
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {line.systemQty}
                        </td>
                        <td className="px-3 py-2">
                          {active.status === "DRAFT" ? (
                            <Input
                              className="h-8 w-24"
                              inputMode="decimal"
                              defaultValue={String(line.countedQty)}
                              onBlur={(e) =>
                                void onCountChange(line.sku, e.target.value)
                              }
                            />
                          ) : (
                            <span className="tabular-nums">
                              {line.countedQty}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 tabular-nums font-medium",
                            line.varianceQty > 0 && "text-emerald-700",
                            line.varianceQty < 0 && "text-rose-700"
                          )}
                        >
                          {line.varianceQty > 0 ? "+" : ""}
                          {line.varianceQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: StockTakeRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        status === "POSTED" && "bg-emerald-100 text-emerald-800",
        status === "DRAFT" && "bg-amber-100 text-amber-900",
        status === "CANCELLED" && "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  )
}
