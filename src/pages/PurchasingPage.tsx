import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"

import {
  PurchaseOrderService,
  PurchaseReceivingService,
  SupplierInvoiceService,
  SupplierPaymentService,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/purchasing/suppliers", label: "Suppliers" },
  { to: "/purchasing/orders", label: "Purchase Orders" },
  { to: "/purchasing/goods-received", label: "Goods Received" },
  { to: "/purchasing/invoices", label: "Purchase Invoices" },
  { to: "/purchasing/payments", label: "Supplier Payments" },
  { to: "/purchasing/statements", label: "Statements" },
] as const

/**
 * Purchasing shell — Suppliers through AP / payments / statements.
 */
export function PurchasingPage() {
  useEffect(() => {
    void SupplierService.hydrate()
    void PurchaseOrderService.hydrate()
    void PurchaseReceivingService.hydrate()
    void SupplierInvoiceService.hydrate()
    void SupplierPaymentService.hydrate()
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Suppliers, orders, goods received, invoices, and payments. Posted GRNs
          stock inventory; posted invoices create AP — not expenses.
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
