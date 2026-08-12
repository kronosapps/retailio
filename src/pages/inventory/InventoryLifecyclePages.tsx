import { OpeningStockView } from "@/modules/inventory/components/OpeningStockView"
import { StockTakeView } from "@/modules/inventory/components/StockTakeView"
import { LotsHealthView } from "@/modules/inventory/components/LotsHealthView"

export function InventoryOpeningPage() {
  return <OpeningStockView />
}

export function InventoryStockTakePage() {
  return <StockTakeView />
}

export function InventoryLotsPage() {
  return <LotsHealthView />
}
