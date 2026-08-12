/**
 * Settings / Configuration Center catalog.
 * Business settings live in store/DB (or local settings stores).
 * Deploy secrets and infra stay in `src/core/config/env.ts` — never mirrored here as editable fields.
 */

import type { UserRole } from "@/types/user"

export type SettingsSectionId =
  | "business"
  | "invoice"
  | "tax"
  | "inventory"
  | "pos"
  | "payments"
  | "banking"
  | "notifications"
  | "users"
  | "integrations"
  | "data"

export type SettingsStorage =
  /** Editable business config in Firestore / local settings stores. */
  | "store"
  /** Read-only deploy env — edit via .env / hosting config. */
  | "env"
  /** Deep-link to an existing operational tool. */
  | "link"

export type SettingsSection = {
  id: SettingsSectionId
  title: string
  description: string
  /** In-app path under /settings/* or absolute app path. */
  path: string
  storage: SettingsStorage
  roles: UserRole[]
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "business",
    title: "Business",
    description: "Legal identity, address, GSTIN, branding",
    path: "/utilities/business-setup",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "invoice",
    title: "Invoice",
    description: "Invoice prefix and receipt footer",
    path: "/settings/invoice",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "tax",
    title: "Tax",
    description: "GST pricing mode, store state, default rates",
    path: "/settings/tax",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Default reorder level for new / unset SKUs",
    path: "/settings/inventory",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "pos",
    title: "POS",
    description: "Checkout gates and lane notes",
    path: "/settings/pos",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "payments",
    title: "Payments",
    description: "Merchant UPI, timeout, receipt WhatsApp labels",
    path: "/settings/payments",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "banking",
    title: "Banking",
    description: "Cash / UPI ledger — account display from env until migrated",
    path: "/banking",
    storage: "link",
    roles: ["admin"],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Staff alert thresholds and role mutes",
    path: "/settings/notifications",
    storage: "store",
    roles: ["admin"],
  },
  {
    id: "users",
    title: "Users & Roles",
    description: "Staff management — create, edit, deactivate accounts",
    path: "/staff",
    storage: "link",
    roles: ["admin"],
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Sheets sync status, webhooks (env), Sync Center",
    path: "/settings/integrations",
    storage: "env",
    roles: ["admin"],
  },
  {
    id: "data",
    title: "Data / Backup",
    description: "Database and domain exports — restore inspect-only",
    path: "/utilities/backup",
    storage: "link",
    roles: ["admin"],
  },
]

export function settingsSectionsForRole(
  role: UserRole | null | undefined
): SettingsSection[] {
  if (!role) return []
  return SETTINGS_SECTIONS.filter((s) => s.roles.includes(role))
}

export function canAccessSettingsPath(
  role: UserRole | null | undefined,
  pathname: string
): boolean {
  if (!role || role !== "admin") return false
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname
  if (path === "/settings") return true
  if (!path.startsWith("/settings/")) return false
  return SETTINGS_SECTIONS.some(
    (s) => s.path === path && s.roles.includes(role)
  )
}
