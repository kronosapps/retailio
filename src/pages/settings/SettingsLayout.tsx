import { NavLink, Outlet } from "react-router-dom"
import { Suspense, useMemo } from "react"
import { Settings2 } from "lucide-react"

import { settingsSectionsForRole } from "@/modules/settings"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

export function SettingsLayout() {
  const { role } = useAuth()
  const sections = useMemo(() => settingsSectionsForRole(role), [role])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Settings2 className="size-6" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Business configuration for this store. Deploy secrets and Firebase /
          webhook URLs stay in environment config — not editable here.
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto text-sm">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            cn(
              "rounded-md px-2.5 py-1 whitespace-nowrap",
              isActive ? "bg-muted font-medium" : "text-muted-foreground"
            )
          }
        >
          Home
        </NavLink>
        {sections
          .filter((s) => s.path.startsWith("/settings/"))
          .map((s) => (
            <NavLink
              key={s.id}
              to={s.path}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2.5 py-1 whitespace-nowrap",
                  isActive ? "bg-muted font-medium" : "text-muted-foreground"
                )
              }
            >
              {s.title}
            </NavLink>
          ))}
      </nav>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  )
}
