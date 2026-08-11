import { Link } from "react-router-dom"
import { useMemo } from "react"

import {
  UTILITY_GROUPS,
  utilityToolsForRole,
} from "@/modules/utilities"
import { useAuth } from "@/providers/AuthProvider"

export function UtilitiesHomePage() {
  const { role } = useAuth()
  const tools = useMemo(() => utilityToolsForRole(role), [role])

  return (
    <div className="space-y-8">
      {UTILITY_GROUPS.map((group) => {
        const items = tools.filter((t) => t.group === group.id)
        if (items.length === 0) return null
        return (
          <section key={group.id} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((tool) => (
                <Link
                  key={tool.id}
                  to={tool.path}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <p className="font-medium">{tool.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
