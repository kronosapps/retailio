import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { InventoryService } from "@/modules/inventory"
import { MasterDataService } from "@/modules/masterData"
import { ProductService } from "@/modules/products"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

const TABS = [
  { to: "/inventory/items", labelKey: "inventory.tabs.items" },
  { to: "/inventory/import", labelKey: "inventory.tabs.import" },
  { to: "/inventory/stock", labelKey: "inventory.tabs.stock" },
  { to: "/inventory/opening", labelKey: "inventory.tabs.opening" },
  { to: "/inventory/stock-take", labelKey: "inventory.tabs.stockTake" },
  { to: "/inventory/lots", labelKey: "inventory.tabs.lots" },
  { to: "/inventory/movements", labelKey: "inventory.tabs.movements" },
  { to: "/inventory/categories", labelKey: "inventory.tabs.categories" },
] as const

/**
 * Inventory shell — Items / Stock / lifecycle / Movements / Categories.
 */
export function InventoryPage() {
  const { t } = useTranslation()
  const { userId, profile } = useAuth()

  useEffect(() => {
    const storeId = profile?.storeId ?? null
    const actorId = userId
    void ProductService.ensureCatalogSeeded(storeId, actorId)
    void InventoryService.ensureSamples(storeId, actorId)
    void InventoryService.ensureCategoriesFromProducts(storeId, actorId)
    void MasterDataService.bootstrapFromCatalog(storeId, actorId)
    void InventoryService.hydrateLots()
  }, [profile?.storeId, userId])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("inventory.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("inventory.subtitle")}
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
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
