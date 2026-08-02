import { NavLink, Outlet } from "react-router-dom"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

export function PosLayout() {
  const { profile, role, signOut } = useAuth()

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              R
            </div>
            <span className="text-base font-semibold tracking-tight">
              RetailOS
            </span>
          </div>

          {role === "admin" ? (
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/pos"
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )
                }
              >
                POS
              </NavLink>
              <NavLink
                to="/inventory"
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )
                }
              >
                Inventory
              </NavLink>
            </nav>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium">
              {profile?.displayName || profile?.email || "Cashier"}
            </p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {role ?? "staff"}
              {profile?.storeId ? ` · ${profile.storeId}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void signOut()}
          >
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
