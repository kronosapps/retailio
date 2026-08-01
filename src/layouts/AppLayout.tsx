import { NavLink, Outlet } from "react-router-dom"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  LogOut,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/pos", label: "POS", icon: ShoppingCart, adminOnly: false },
  { to: "/inventory", label: "Inventory", icon: Package, adminOnly: true },
] as const

export function AppLayout() {
  const { profile, role, isOverride, signOut } = useAuth()

  const visibleNav = navItems.filter(
    (item) => !item.adminOnly || role === "admin"
  )

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            RetailOS
          </p>
          <p className="mt-1 truncate text-sm font-medium">
            {profile?.displayName || profile?.email || "Store"}
          </p>
          {role ? (
            <p className="mt-0.5 text-xs text-muted-foreground capitalize">
              {role}
              {isOverride ? " · override" : ""}
            </p>
          ) : null}
        </div>

        <Separator />

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
