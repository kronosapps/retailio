import { Navigate } from "react-router-dom"

import { GoodsReceivedView } from "@/modules/purchasing/components/GoodsReceivedView"
import { SuppliersView } from "@/modules/supplier/components/SuppliersView"

export function PurchasingIndexRedirect() {
  return <Navigate to="/purchasing/suppliers" replace />
}

export function PurchasingSuppliersPage() {
  return <SuppliersView />
}

export function PurchasingGoodsReceivedPage() {
  return <GoodsReceivedView />
}
