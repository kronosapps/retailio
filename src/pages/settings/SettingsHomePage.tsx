import { Link } from "react-router-dom"
import { useMemo } from "react"
import { ExternalLink } from "lucide-react"

import {
  SETTINGS_SECTIONS,
  settingsSectionsForRole,
  type SettingsStorage,
} from "@/modules/settings"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

function storageBadge(storage: SettingsStorage) {
  if (storage === "env") return "Env (read-only)"
  if (storage === "link") return "Opens tool"
  return "Store settings"
}

/**
 * Settings / Configuration Center home.
 */
export function SettingsHomePage() {
  const { role } = useAuth()
  const sections = useMemo(() => settingsSectionsForRole(role), [role])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Central place for store configuration. Utilities remain for accounting
        tools and reports; this hub is for settings only.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.id}
            to={section.path}
            className="rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{section.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  section.storage === "env"
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {storageBadge(section.storage)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {section.description}
            </p>
            {!section.path.startsWith("/settings") ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink className="size-3" />
                {section.path}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No settings sections for this role.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {SETTINGS_SECTIONS.length} sections defined · admin access required
      </p>
    </div>
  )
}
