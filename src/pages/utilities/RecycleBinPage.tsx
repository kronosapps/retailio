import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ProductService } from "@/modules/products"
import { UtilitiesAnalysisService } from "@/modules/utilities"
import { useAuth } from "@/providers/AuthProvider"

export function RecycleBinPage() {
  const { userId } = useAuth()
  const [tick, setTick] = useState(0)
  const items = useMemo(() => {
    void tick
    return UtilitiesAnalysisService.inactiveProducts()
  }, [tick])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Recycle Bin</h2>
        <p className="text-sm text-muted-foreground">
          Soft-deactivated products only. Paid invoices and payments cannot be
          permanently deleted from Utilities.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">Product</td>
                <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void ProductService.setActive(p.id, true, userId).then(
                        () => setTick((n) => n + 1)
                      )
                    }}
                  >
                    Restore
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No deactivated products.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
