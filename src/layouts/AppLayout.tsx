import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  LayoutDashboard,
  Landmark,
  Package,
  PackageOpen,
  Receipt,
  Settings2,
  ShoppingCart,
  UserCog,
  Users,
  LogOut,
  ChartColumn,
  Wrench,
  Menu,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { navItemsForRole, roleLabel } from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/pos": ShoppingCart,
  "/inventory": Package,
  "/purchasing": PackageOpen,
  "/customers": Users,
  "/transactions": Receipt,
  "/reports": ChartColumn,
  "/utilities": Wrench,
  "/banking": Landmark,
  "/options": Settings2,
  "/staff": UserCog,
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  )
}

export function AppLayout() {
  const { profile, role, signOut } = useAuth()
  const visibleNav = navItemsForRole(role)
  const [navOpen, setNavOpen] = useState(false)

  const navLinks = (
    <>
      {visibleNav.map(({ to, label }) => {
        const Icon = NAV_ICONS[to] ?? LayoutDashboard
        return (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setNavOpen(false)}
            className={navLinkClass}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        )
      })}
    </>
  )

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background md:flex-row">
      {/* Mobile top bar */}
      <header
        className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight">
              RetailOS
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.displayName || profile?.username || "Store"}
              {role ? ` · ${roleLabel(role)}` : ""}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => void signOut()}
        >
          <LogOut data-icon="inline-start" />
          <span className="sr-only">Sign out</span>
        </Button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
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

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {navLinks}
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

      {/* Mobile nav drawer */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(100%,20rem)] flex-col bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>Navigate</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {navLinks}
          </nav>
          <div className="border-t border-border p-3">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setNavOpen(false)
                void signOut()
              }}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main
        className="min-h-0 min-w-0 flex-1 overflow-auto p-3 md:p-6"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
