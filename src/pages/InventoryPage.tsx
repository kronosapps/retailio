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
  { to: "/inventory/movements", label: "Movements", end: false },
  { to: "/inventory/categories", label: "Categories", end: false },
] as const

/**
 * Inventory shell — Items / Stock / Movements / Categories.
 */
export function InventoryPage() {
  const { userId, profile } = useAuth()

  useEffect(() => {
    const storeId = profile?.storeId ?? null
    const actorId = userId
    void ProductService.ensureCatalogSeeded(storeId, actorId)
    void InventoryService.ensureSamples(storeId, actorId)
    void InventoryService.ensureCategoriesFromProducts(storeId, actorId)
  }, [profile?.storeId, userId])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Manage items, stock on hand, movements, and categories.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
