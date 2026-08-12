import { Navigate } from "react-router-dom"

import { SuppliersView } from "@/modules/supplier/components/SuppliersView"

export function PurchasingIndexRedirect() {
  return <Navigate to="/purchasing/suppliers" replace />
}

export function PurchasingSuppliersPage() {
  return <SuppliersView />
}
