import { NavLink, Outlet } from "react-router-dom"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

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
  { to: "/purchasing/suppliers", labelKey: "purchasing.tabs.suppliers" },
  { to: "/purchasing/quick", labelKey: "purchasing.tabs.quick" },
  { to: "/purchasing/orders", labelKey: "purchasing.tabs.orders" },
  { to: "/purchasing/goods-received", labelKey: "purchasing.tabs.goodsReceived" },
  { to: "/purchasing/invoices", labelKey: "purchasing.tabs.invoices" },
  { to: "/purchasing/payments", labelKey: "purchasing.tabs.payments" },
  { to: "/purchasing/returns", labelKey: "purchasing.tabs.returns" },
  { to: "/purchasing/statements", labelKey: "purchasing.tabs.statements" },
  { to: "/purchasing/match", labelKey: "purchasing.tabs.match" },
] as const

/**
 * Purchasing shell — Suppliers through AP / payments / returns / match.
 */
export function PurchasingPage() {
  const { t } = useTranslation()

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
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("purchasing.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("purchasing.subtitle")}
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
