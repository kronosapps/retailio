import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { LOCALES, isLocaleCode, type LocaleCode } from "./registry"

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string
  /** Icon-only width for tight headers */
  compact?: boolean
}) {
  const { i18n, t } = useTranslation()
  const current = isLocaleCode(i18n.language)
    ? i18n.language
    : (i18n.resolvedLanguage as LocaleCode | undefined) ?? "en"

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {!compact ? (
        <span className="hidden sm:inline">{t("language.label")}</span>
      ) : (
        <span className="sr-only">{t("language.label")}</span>
      )}
      <select
        aria-label={t("language.label")}
        className={cn(
          "h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        value={current}
        onChange={(e) => {
          const next = e.target.value
          if (isLocaleCode(next)) void i18n.changeLanguage(next)
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.nativeName}
          </option>
        ))}
      </select>
    </label>
  )
}
