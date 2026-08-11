import { env } from "@/core/config/env"
import { bankingEngine } from "@/modules/banking"
import { inventoryEngine } from "@/modules/inventory"
import { notificationEngine } from "@/modules/notifications"
import { ProductService } from "@/modules/products"
import { syncManager } from "@/services/sync"

/**
 * Application bootstrap — start infrastructure outside React render trees.
 * Call once from main.tsx.
 */
export function bootstrapApp() {
  syncManager.start()
  notificationEngine.start()
  bankingEngine.start()
  inventoryEngine.start()

  void ProductService.ensureCatalogSeeded(env.storeId || null, "system").catch(
    (error) => {
      if (import.meta.env.DEV) {
        console.warn("[RetailOS] Product catalog seed failed", error)
      }
    }
  )
}
