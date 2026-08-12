import { NavLink, Outlet } from "react-router-dom"
import { Suspense, useMemo } from "react"

import { FinancialYearService } from "@/modules/financialYear"
import { utilityToolsForRole } from "@/modules/utilities"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

export function UtilitiesLayout() {
  const { role } = useAuth()
  const tools = useMemo(() => utilityToolsForRole(role), [role])
  const fy = FinancialYearService.getActive()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilities</h1>
          <p className="text-sm text-muted-foreground">
            Setup, hybrid accounting, analysis & statutory scaffolds.
          </p>
        </div>
        <p className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
          Active FY: <strong>{fy.label}</strong> ({fy.startDate} → {fy.endDate})
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto text-sm">
        <NavLink
          to="/utilities"
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
        {tools.slice(0, 6).map((t) => (
          <NavLink
            key={t.id}
            to={t.path}
            className={({ isActive }) =>
              cn(
                "rounded-md px-2.5 py-1 whitespace-nowrap",
                isActive ? "bg-muted font-medium" : "text-muted-foreground"
              )
            }
          >
            {t.title}
          </NavLink>
        ))}
      </nav>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading tool…</p>
        }
      >
        <Outlet />
      </Suspense>
    </div>
  )
}
