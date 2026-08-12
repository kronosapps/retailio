import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"

import {
  PurchaseOrderService,
  PurchaseReceivingService,
  PurchaseReturnService,
  SupplierInvoiceService,
  SupplierPaymentService,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/purchasing/suppliers", label: "Suppliers" },
  { to: "/purchasing/quick", label: "Quick buy" },
  { to: "/purchasing/orders", label: "Purchase Orders" },
  { to: "/purchasing/goods-received", label: "Goods Received" },
  { to: "/purchasing/invoices", label: "Purchase Invoices" },
  { to: "/purchasing/payments", label: "Supplier Payments" },
  { to: "/purchasing/returns", label: "Returns" },
  { to: "/purchasing/statements", label: "Statements" },
  { to: "/purchasing/match", label: "Match" },
] as const

/**
 * Purchasing shell — Suppliers through AP / payments / returns / match.
 */
export function PurchasingPage() {
  useEffect(() => {
    void SupplierService.hydrate()
    void PurchaseOrderService.hydrate()
    void PurchaseReceivingService.hydrate()
    void SupplierInvoiceService.hydrate()
    void SupplierPaymentService.hydrate()
    void PurchaseReturnService.hydrate()
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Suppliers, orders, goods received, invoices, payments, and returns.
          Posted GRNs stock inventory; posted invoices create AP; returns
          reverse stock and AP.
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
