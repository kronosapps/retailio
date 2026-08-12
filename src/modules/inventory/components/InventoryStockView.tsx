import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import {
  InventoryService,
  stockStatusLabel,
  type StockStatus,
} from "@/modules/inventory"
import { cn } from "@/lib/utils"

import { StockActionDialogs } from "./StockActionDialogs"

export function InventoryStockView() {
  const [tick, setTick] = useState(0)
  const [search, setSearch] = useState("")
  const [action, setAction] = useState<{
    sku: string
    mode: "add" | "adjust"
  } | null>(null)
  const [historySku, setHistorySku] = useState<string | null>(null)

  const summary = useMemo(() => {
    void tick
    return InventoryService.getInventorySummary()
  }, [tick])

  const rows = useMemo(() => {
    void tick
    const q = search.trim().toLowerCase()
    return InventoryService.getAllStock({ includeInactive: false }).filter(
      (row) =>
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q)
    )
  }, [tick, search])

  const history = useMemo(() => {
    if (!historySku) return []
    void tick
    return InventoryService.getMovementHistory(historySku).slice(0, 20)
  }, [historySku, tick])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total items" value={summary.totalItems} />
        <Stat label="Total units" value={summary.totalUnits} />
        <Stat label="Low stock" value={summary.lowStockCount} tone="amber" />
        <Stat label="Out of stock" value={summary.outOfStockCount} tone="red" />
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search stock…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ResponsiveList
        cards={rows.map((row) => (
          <MobileListCard
            key={row.sku}
            title={row.name}
            meta={
              <>
                <span className="font-mono">{row.sku}</span> · Qty {row.quantity}{" "}
                · Reorder {row.reorderLevel}
              </>
            }
            badge={<StatusChip status={row.status} />}
            actions={
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10"
                  onClick={() => setAction({ sku: row.sku, mode: "add" })}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10"
                  onClick={() => setAction({ sku: row.sku, mode: "adjust" })}
                >
                  Adjust
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-10"
                  onClick={() => setHistorySku(row.sku)}
                >
                  History
                </Button>
              </>
            }
          />
        ))}
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Current stock</th>
                  <th className="px-3 py-2 font-medium">Reorder</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sku} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {row.sku}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.quantity}</td>
                    <td className="px-3 py-2">{row.reorderLevel}</td>
                    <td className="px-3 py-2">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAction({ sku: row.sku, mode: "add" })
                          }
                        >
                          Add
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAction({ sku: row.sku, mode: "adjust" })
                          }
                        >
                          Adjust
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistorySku(row.sku)}
                        >
                          History
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />

      {historySku && (
        <section className="rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">History · {historySku}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistorySku(null)}
            >
              Close
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {history.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 border-b py-1 last:border-0">
                <span>
                  {new Date(m.createdAt).toLocaleString()} · {m.type} · qty{" "}
                  {m.quantity}
                </span>
                <span className="text-muted-foreground">
                  bal {m.balanceAfter}
                </span>
              </li>
            ))}
            {history.length === 0 && (
              <li className="text-muted-foreground">No movements.</li>
            )}
          </ul>
        </section>
      )}

      {action && (
        <StockActionDialogs
          sku={action.sku}
          mode={action.mode}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null)
            setTick((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "amber" | "red"
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "amber" && "text-amber-700",
          tone === "red" && "text-red-700"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function StatusChip({ status }: { status: StockStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === "out_of_stock" && "bg-red-100 text-red-800",
        status === "low_stock" && "bg-amber-100 text-amber-900",
        status === "in_stock" && "bg-emerald-100 text-emerald-900"
      )}
    >
      {stockStatusLabel(status)}
    </span>
  )
}
