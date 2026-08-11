import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  InventoryService,
  movementTypeLabel,
  stockStatusLabel,
} from "@/modules/inventory"
import { cn } from "@/lib/utils"

type Props = {
  row: ReturnType<typeof InventoryService.getAllStock>[number]
  onClose: () => void
  onEdit: () => void
  onAddStock: () => void
  onAdjustStock: () => void
  onChanged: () => void
}

export function ItemDetailPanel({
  row,
  onClose,
  onEdit,
  onAddStock,
  onAdjustStock,
}: Props) {
  const [tick, setTick] = useState(0)
  const movements = useMemo(() => {
    void tick
    return InventoryService.getMovementHistory(row.sku).slice(0, 12)
  }, [row.sku, tick])

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{row.name}</h2>
          <p className="text-sm text-muted-foreground">
            {row.sku}
            {row.barcode ? ` · ${row.barcode}` : ""} · {row.category}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" size="sm" onClick={onAddStock}>
            Add stock
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onAdjustStock}>
            Adjust
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Current stock" value={String(row.quantity)} />
        <Metric label="Reorder level" value={String(row.reorderLevel)} />
        <Metric label="Selling price" value={`₹${row.sellingPrice}`} />
        <Metric
          label="Status"
          value={stockStatusLabel(row.status)}
          className={
            row.status === "out_of_stock"
              ? "text-red-700"
              : row.status === "low_stock"
                ? "text-amber-700"
                : "text-emerald-700"
          }
        />
        <Metric
          label="Cost price"
          value={row.costPrice == null ? "—" : `₹${row.costPrice}`}
        />
        <Metric label="GST" value={`${row.gstRate}%`} />
        <Metric label="Active" value={row.active ? "Yes" : "No"} />
        <Metric label="Unit" value={row.unit} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Recent movements</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTick((n) => n + 1)}
          >
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Type</th>
                <th className="px-2 py-1.5 font-medium">Qty</th>
                <th className="px-2 py-1.5 font-medium">Balance</th>
                <th className="px-2 py-1.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">{movementTypeLabel(m.type)}</td>
                  <td className="px-2 py-1.5">{m.quantity}</td>
                  <td className="px-2 py-1.5">{m.balanceAfter}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {m.reason || "—"}
                  </td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-4 text-center text-muted-foreground"
                  >
                    No movements yet for this item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Metric({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", className)}>{value}</p>
    </div>
  )
}
