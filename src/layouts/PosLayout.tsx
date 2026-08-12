import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import { LogOut, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { navItemsForRole, roleLabel } from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-2.5 py-2 text-sm transition-colors",
    isActive
      ? "bg-muted font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
  )
}

export function PosLayout() {
  const { profile, role, signOut } = useAuth()
  const nav = navItemsForRole(role).filter((item) => item.to !== "/pos")
  const [navOpen, setNavOpen] = useState(false)

  const links = (
    <>
      <NavLink
        to="/pos"
        onClick={() => setNavOpen(false)}
        className={navLinkClass}
      >
        POS
      </NavLink>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={() => setNavOpen(false)}
          className={navLinkClass}
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <header
        className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:gap-4 sm:px-4"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 sm:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              R
            </div>
            <span className="text-base font-semibold tracking-tight">
              RetailOS
            </span>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">{links}</nav>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium">
              {profile?.displayName || profile?.username || "Staff"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {role ? roleLabel(role) : "staff"}
              {profile?.storeId ? ` · ${profile.storeId}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void signOut()}
          >
            <LogOut data-icon="inline-start" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-[min(100%,20rem)] p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Navigate</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-3">{links}</nav>
        </SheetContent>
      </Sheet>

      <main className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
