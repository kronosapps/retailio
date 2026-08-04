/**
 * Shared domain types for cross-module contracts.
 * Collection-specific shapes live with their repositories when needed.
 */

export type StoreId = string

export type SyncStatus =
  | "Pending"
  | "Syncing"
  | "Completed"
  | "Failed"
  | "Retrying"
  | "DeadLetter"

export type EntityTimestamps = {
  createdAt: string
  updatedAt: string
}
