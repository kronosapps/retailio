import { Link } from "react-router-dom"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"

import {
  SETTINGS_SECTIONS,
  settingsSectionsForRole,
  type SettingsStorage,
} from "@/modules/settings"
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

function storageBadgeKey(storage: SettingsStorage) {
  if (storage === "env") return "settings.storage.env"
  if (storage === "link") return "settings.storage.link"
  return "settings.storage.store"
}

/**
 * Settings / Configuration Center home.
 */
export function SettingsHomePage() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const sections = useMemo(() => settingsSectionsForRole(role), [role])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("settings.languageHint")}</p>
        <LanguageSwitcher />
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.homeIntro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.id}
            to={section.path}
            className="rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {t(`settings.sections.${section.id}.title`)}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  section.storage === "env"
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {t(storageBadgeKey(section.storage))}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`settings.sections.${section.id}.description`)}
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
          {t("settings.noSections")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("settings.sectionsMeta", { count: SETTINGS_SECTIONS.length })}
      </p>
    </div>
  )
}
