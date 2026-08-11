import { NavLink, Outlet } from "react-router-dom"
import {
  LayoutDashboard,
  Landmark,
  Package,
  Receipt,
  Settings2,
  ShoppingCart,
  UserCog,
  Users,
  LogOut,
  ChartColumn,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { navItemsForRole, roleLabel } from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/pos": ShoppingCart,
  "/inventory": Package,
  "/customers": Users,
  "/transactions": Receipt,
  "/reports": ChartColumn,
  "/utilities": Wrench,
  "/banking": Landmark,
  "/options": Settings2,
  "/staff": UserCog,
}

export function AppLayout() {
  const { profile, role, signOut } = useAuth()
  const visibleNav = navItemsForRole(role)

  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            RetailOS
          </p>
          <p className="mt-1 truncate text-sm font-medium">
            {profile?.displayName || profile?.username || "Store"}
          </p>
          {role ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {roleLabel(role)}
              {profile?.username ? ` · @${profile.username}` : ""}
            </p>
          ) : null}
        </div>

        <Separator />

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleNav.map(({ to, label }) => {
            const Icon = NAV_ICONS[to] ?? LayoutDashboard
            return (
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
            )
          })}
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

      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
