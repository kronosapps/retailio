import { syncManager } from "@/services/sync"

/**
 * Application bootstrap — start infrastructure outside React render trees.
 * Call once from main.tsx.
 */
export function bootstrapApp() {
  syncManager.start()
}
