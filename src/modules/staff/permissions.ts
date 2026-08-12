import type { UserRole } from "@/types/user"
import { canAccessUtilityPath } from "@/modules/utilities/catalog"
import { canAccessSettingsPath } from "@/modules/settings/catalog"

export type StaffNavItem = {
  to: string
  label: string
  roles: UserRole[]
}

/** Canonical nav + access map. Layouts and guards use this — not hard-coded role checks. */
export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { to: "/", label: "Dashboard", roles: ["admin", "manager"] },
  { to: "/pos", label: "POS", roles: ["admin", "manager", "cashier"] },
  { to: "/shifts", label: "Shifts", roles: ["admin", "manager", "cashier"] },
  { to: "/day-ops", label: "Day Ops", roles: ["admin", "manager"] },
  { to: "/returns", label: "Returns", roles: ["admin", "manager"] },
  { to: "/inventory", label: "Inventory", roles: ["admin", "manager"] },
  { to: "/purchasing", label: "Purchasing", roles: ["admin", "manager"] },
  { to: "/customers", label: "Customers", roles: ["admin", "manager"] },
  { to: "/transactions", label: "Transactions", roles: ["admin", "manager"] },
  { to: "/reports", label: "Reports", roles: ["admin", "manager"] },
  { to: "/utilities", label: "Utilities", roles: ["admin", "manager"] },
  { to: "/banking", label: "Banking", roles: ["admin"] },
  { to: "/settings", label: "Settings", roles: ["admin"] },
  { to: "/staff", label: "Staff", roles: ["admin"] },
]

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "admin"
}

export function isManagerOrAbove(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "manager"
}

export function navItemsForRole(role: UserRole | null | undefined): StaffNavItem[] {
  if (!role) return []
  return STAFF_NAV_ITEMS.filter((item) => item.roles.includes(role))
}

export function homePathForRole(role: UserRole | null | undefined): string {
  if (role === "cashier") return "/pos"
  if (role === "manager" || role === "admin") return "/"
  return "/login"
}

export function canAccessPath(
  role: UserRole | null | undefined,
  pathname: string
): boolean {
  if (!role) return false

  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname

  if (path.startsWith("/invoices/")) {
    return isManagerOrAbove(role)
  }

  if (path === "/day-ops" || path.startsWith("/day-ops/")) {
    return isManagerOrAbove(role)
  }

  if (path === "/inventory" || path.startsWith("/inventory/")) {
    return isManagerOrAbove(role)
  }

  if (path === "/purchasing" || path.startsWith("/purchasing/")) {
    return isManagerOrAbove(role)
  }

  if (path === "/customers" || path.startsWith("/customers/")) {
    return isManagerOrAbove(role)
  }

  if (path === "/utilities" || path.startsWith("/utilities/")) {
    return canAccessUtilityPath(role, path)
  }

  if (path === "/settings" || path.startsWith("/settings/")) {
    return canAccessSettingsPath(role, path)
  }

  // Legacy bookmark
  if (path === "/options") {
    return role === "admin"
  }

  return navItemsForRole(role).some((item) => item.to === path)
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin"
    case "manager":
      return "Manager"
    case "cashier":
      return "Cashier"
  }
}
