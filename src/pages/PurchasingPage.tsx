import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"

import { PurchaseReceivingService } from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/purchasing/suppliers", label: "Suppliers" },
  { to: "/purchasing/goods-received", label: "Goods Received" },
] as const

/**
 * Purchasing shell — Suppliers + Goods Received (ad-hoc GRN).
 * Later: Purchase Orders, Invoices, Returns, Payments, Statements.
 */
export function PurchasingPage() {
  useEffect(() => {
    void SupplierService.hydrate()
    void PurchaseReceivingService.hydrate()
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Suppliers and goods received. Posted GRNs are the purchase path into
          inventory — not expenses.
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
