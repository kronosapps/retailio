import { Navigate } from "react-router-dom"

import { InventoryItemsView } from "@/modules/inventory/components/InventoryItemsView"

/** Default inventory landing → Items. */
export function InventoryIndexRedirect() {
  return <Navigate to="/inventory/items" replace />
}

export function InventoryItemsPage() {
  return <InventoryItemsView />
}
