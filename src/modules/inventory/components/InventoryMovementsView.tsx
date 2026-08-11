import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import {
  INVENTORY_MOVEMENT_TYPES,
  InventoryService,
  movementTypeLabel,
  type InventoryMovementType,
} from "@/modules/inventory"
import { cn } from "@/lib/utils"

export function InventoryMovementsView() {
  const [search, setSearch] = useState("")
  const [type, setType] = useState<"all" | InventoryMovementType>("all")
  const [staff, setStaff] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")

  const rows = useMemo(() => {
    let list = InventoryService.getMovementHistory()
    if (type !== "all") list = list.filter((m) => m.type === type)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (m) =>
          m.productName.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q)
      )
    }
    if (staff.trim()) {
      const q = staff.trim().toLowerCase()
      list = list.filter(
        (m) =>
          (m.createdByName || "").toLowerCase().includes(q) ||
          (m.createdBy || "").toLowerCase().includes(q)
      )
    }
    if (fromDate) {
      const start = new Date(fromDate).getTime()
      list = list.filter((m) => new Date(m.createdAt).getTime() >= start)
    }
    if (toDate) {
      const end = new Date(toDate).getTime() + 86_400_000
      list = list.filter((m) => new Date(m.createdAt).getTime() < end)
    }
    return list
  }, [search, type, staff, fromDate, toDate])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Item or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={cn(
            "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
          )}
          value={type}
          onChange={(e) =>
            setType(e.target.value as typeof type)
          }
        >
          <option value="all">All types</option>
          {INVENTORY_MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {movementTypeLabel(t)}
            </option>
          ))}
        </select>
        <Input
          className="max-w-[10rem]"
          placeholder="Staff…"
          value={staff}
          onChange={(e) => setStaff(e.target.value)}
        />
        <Input
          type="date"
          className="w-auto"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <Input
          type="date"
          className="w-auto"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Staff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div>{m.productName}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {m.sku}
                  </div>
                </td>
                <td className="px-3 py-2">{movementTypeLabel(m.type)}</td>
                <td className="px-3 py-2 tabular-nums">{m.quantity}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {m.referenceId || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {m.reason || "—"}
                </td>
                <td className="px-3 py-2">
                  {m.createdByName || m.createdBy || "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No movements match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
