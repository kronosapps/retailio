import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"

import { InventoryService } from "@/modules/inventory"
import { ProductService } from "@/modules/products"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

const TABS = [
  { to: "/inventory/items", label: "Items", end: false },
  { to: "/inventory/import", label: "Import", end: false },
  { to: "/inventory/stock", label: "Stock", end: false },
  { to: "/inventory/opening", label: "Opening", end: false },
  { to: "/inventory/stock-take", label: "Stock take", end: false },
  { to: "/inventory/lots", label: "Lots & health", end: false },
  { to: "/inventory/movements", label: "Movements", end: false },
  { to: "/inventory/categories", label: "Categories", end: false },
] as const

/**
 * Inventory shell — Items / Stock / lifecycle / Movements / Categories.
 */
export function InventoryPage() {
  const { userId, profile } = useAuth()

  useEffect(() => {
    const storeId = profile?.storeId ?? null
    const actorId = userId
    void ProductService.ensureCatalogSeeded(storeId, actorId)
    void InventoryService.ensureSamples(storeId, actorId)
    void InventoryService.ensureCategoriesFromProducts(storeId, actorId)
    void InventoryService.hydrateLots()
  }, [profile?.storeId, userId])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Items, on-hand stock, lots (FEFO), stock take, movements, and
          categories.
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto whitespace-nowrap rounded-lg border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "min-h-10 shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
