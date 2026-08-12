/**
 * Thresholds + prefs for staff operational alerts (offline-first).
 */

import type { UserRole } from "@/types/user"
import type { NotificationMessageType } from "./types/notification"
import { ALERT_MESSAGE_TYPES } from "./types/notification"

export type AlertRoleMutes = Partial<
  Record<UserRole, NotificationMessageType[]>
>

export type AlertThresholds = {
  version: 2
  /** Discount share of gross that triggers large_discount (0–1). */
  largeDiscountRatio: number
  /** Absolute discount paisa floor. */
  largeDiscountMinPaisa: number
  /** Refund amount paisa that triggers large_refund. */
  largeRefundMinPaisa: number
  /** Absolute till variance paisa. */
  cashVarianceMinPaisa: number
  /** Customer AR outstanding paisa. */
  customerOutstandingMinPaisa: number
  /** Supplier AP remaining paisa. */
  supplierOutstandingMinPaisa: number
  /** Lot expiry window (days). */
  expiryWithinDays: number
  /** Suppress duplicate staff alerts for the same dedupeKey within this ms. */
  dedupeWindowMs: number
  /**
   * Batch low_stock into one daily digest card (out_of_stock stays per-SKU).
   */
  lowStockDigest: boolean
  /** Queue Telegram sibling for critical in-app alerts (token stays in CF). */
  telegramCriticalEnabled: boolean
  /** Public Telegram chat/group id for night phone (not a bot token). */
  telegramChatId: string
  /** Per-role muted message types (still raised; hidden in that role’s inbox). */
  roleMutes: AlertRoleMutes
}

const STORAGE_KEY = "retailos.alert_thresholds.v1"

/** Cashier inbox stays POS-relevant; managers/admins see everything by default. */
export const DEFAULT_ROLE_MUTES: AlertRoleMutes = {
  cashier: [
    "low_stock",
    "expiring_stock",
    "pending_purchase",
    "outstanding_supplier",
    "outstanding_customer",
    "failed_sync",
    "large_discount",
  ],
  manager: [],
  admin: [],
}

const DEFAULTS: AlertThresholds = {
  version: 2,
  largeDiscountRatio: 0.2,
  largeDiscountMinPaisa: 50000, // ₹500
  largeRefundMinPaisa: 100000, // ₹1000
  cashVarianceMinPaisa: 5000, // ₹50
  customerOutstandingMinPaisa: 50000,
  supplierOutstandingMinPaisa: 100000,
  expiryWithinDays: 14,
  dedupeWindowMs: 6 * 60 * 60 * 1000,
  lowStockDigest: true,
  telegramCriticalEnabled: false,
  telegramChatId: "",
  roleMutes: { ...DEFAULT_ROLE_MUTES },
}

function normalizeMutes(raw: unknown): AlertRoleMutes {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ROLE_MUTES }
  const src = raw as AlertRoleMutes
  const next: AlertRoleMutes = { ...DEFAULT_ROLE_MUTES }
  for (const role of ["admin", "manager", "cashier"] as UserRole[]) {
    const list = src[role]
    if (!Array.isArray(list)) continue
    next[role] = list.filter((t): t is NotificationMessageType =>
      ALERT_MESSAGE_TYPES.includes(t)
    )
  }
  return next
}

export function getAlertThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw) as Partial<AlertThresholds>
    return {
      ...DEFAULTS,
      ...parsed,
      version: 2,
      roleMutes: normalizeMutes(parsed.roleMutes ?? DEFAULT_ROLE_MUTES),
      telegramChatId:
        typeof parsed.telegramChatId === "string" ? parsed.telegramChatId : "",
      lowStockDigest: Boolean(
        parsed.lowStockDigest ?? DEFAULTS.lowStockDigest
      ),
      telegramCriticalEnabled: Boolean(
        parsed.telegramCriticalEnabled ?? DEFAULTS.telegramCriticalEnabled
      ),
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function saveAlertThresholds(
  patch: Partial<AlertThresholds>
): AlertThresholds {
  const current = getAlertThresholds()
  const next: AlertThresholds = {
    ...current,
    ...patch,
    version: 2,
    roleMutes: normalizeMutes(patch.roleMutes ?? current.roleMutes),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function isAlertMutedForRole(
  messageType: NotificationMessageType,
  role: UserRole | null | undefined
): boolean {
  if (!role) return false
  const mutes = getAlertThresholds().roleMutes[role] || []
  return mutes.includes(messageType)
}

export function defaultAlertThresholds(): AlertThresholds {
  return structuredClone(DEFAULTS)
}
