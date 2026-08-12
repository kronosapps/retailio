import { Navigate } from "react-router-dom"

import { GoodsReceivedView } from "@/modules/purchasing/components/GoodsReceivedView"
import { PurchaseInvoicesView } from "@/modules/purchasing/components/PurchaseInvoicesView"
import { PurchaseOrdersView } from "@/modules/purchasing/components/PurchaseOrdersView"
import { PurchaseReturnsView } from "@/modules/purchasing/components/PurchaseReturnsView"
import { PurchasingMatchView } from "@/modules/purchasing/components/PurchasingMatchView"
import { QuickPurchaseView } from "@/modules/purchasing/components/QuickPurchaseView"
import { SupplierPaymentsView } from "@/modules/purchasing/components/SupplierPaymentsView"
import { SupplierStatementsView } from "@/modules/purchasing/components/SupplierStatementsView"
import { SuppliersView } from "@/modules/supplier/components/SuppliersView"

export function PurchasingIndexRedirect() {
  return <Navigate to="/purchasing/suppliers" replace />
}

export function PurchasingSuppliersPage() {
  return <SuppliersView />
}

export function PurchasingQuickPage() {
  return <QuickPurchaseView />
}

export function PurchasingOrdersPage() {
  return <PurchaseOrdersView />
}

export function PurchasingGoodsReceivedPage() {
  return <GoodsReceivedView />
}

export function PurchasingInvoicesPage() {
  return <PurchaseInvoicesView />
}

export function PurchasingPaymentsPage() {
  return <SupplierPaymentsView />
}

export function PurchasingReturnsPage() {
  return <PurchaseReturnsView />
}

export function PurchasingStatementsPage() {
  return <SupplierStatementsView />
}

export function PurchasingMatchPage() {
  return <PurchasingMatchView />
}
