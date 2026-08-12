/**
 * Sync Center façade — UI → SyncService → SyncQueue / SyncManager.
 * React never imports SyncManager for business mutations.
 */

import { EndOfDayService } from "@/modules/reports"
import { syncManager } from "./SyncManager"
import { syncQueue, type SyncQueueItem } from "./SyncQueue"
import { googleSheetsSyncProvider } from "./GoogleSheetsSyncProvider"

export type SyncCenterSnapshot = {
  online: boolean
  sheetsConfigured: boolean
  lastSuccessfulSyncAt: string | null
  pending: SyncQueueItem[]
  failed: SyncQueueItem[]
  deadLetter: SyncQueueItem[]
  completedRecent: SyncQueueItem[]
  eodLastRunAt: string | null
  counts: {
    pending: number
    failed: number
    deadLetter: number
  }
}

export class SyncService {
  static getSnapshot(): SyncCenterSnapshot {
    const all = syncQueue.listAll()
    const pending = syncQueue.listPending()
    const failed = syncQueue.listFailed()
    const deadLetter = syncQueue.listDeadLetters()
    const meta = syncQueue.getMeta()
    const eod = EndOfDayService.getLastRun()
    const completedRecent = all
      .filter((i) => i.status === "Completed")
      .sort((a, b) =>
        (b.completedAt || b.updatedAt).localeCompare(
          a.completedAt || a.updatedAt
        )
      )
      .slice(0, 20)

    const lastFromQueue = meta.lastSuccessfulSyncAt
    const lastFromCompleted = completedRecent[0]?.completedAt ?? null
    const lastSuccessfulSyncAt =
      [lastFromQueue, lastFromCompleted, eod?.ranAt ?? null]
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null

    return {
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      sheetsConfigured: googleSheetsSyncProvider.isConfigured(),
      lastSuccessfulSyncAt,
      pending,
      failed,
      deadLetter,
      completedRecent,
      eodLastRunAt: eod?.ranAt ?? null,
      counts: {
        pending: pending.length,
        failed: failed.length,
        deadLetter: deadLetter.length,
      },
    }
  }

  static getError(id: string): string | null {
    return syncQueue.getById(id)?.error ?? null
  }

  static getItem(id: string): SyncQueueItem | null {
    return syncQueue.getById(id)
  }

  static retryDeadLetter(id: string) {
    return syncManager.retryDeadLetter(id)
  }

  static retryAllDeadLetters() {
    return syncManager.retryAllDeadLetters()
  }

  static processNow() {
    return syncManager.processNow()
  }

  static pruneCompleted() {
    return syncQueue.pruneCompleted()
  }
}
