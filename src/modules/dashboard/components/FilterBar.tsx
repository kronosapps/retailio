import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { RANGE_PRESETS } from "../services/dateRanges"
import type { DashboardRangePreset } from "../types/dashboard"

export function FilterBar({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  onRefresh,
  refreshing,
  generatedAt,
}: {
  preset: DashboardRangePreset
  onPresetChange: (preset: DashboardRangePreset) => void
  customStart: string
  customEnd: string
  onCustomStart: (value: string) => void
  onCustomEnd: (value: string) => void
  onRefresh: () => void
  refreshing: boolean
  generatedAt?: string
}) {
  const { t, i18n } = useTranslation()

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-teal-200/60 bg-gradient-to-r from-teal-50/70 via-card to-sky-50/50 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between dark:border-teal-800/40 dark:from-teal-950/30 dark:to-sky-950/20">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-teal-800 uppercase dark:text-teal-200">
          {t("common.period")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPresetChange(item.id)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                preset === item.id
                  ? "border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-teal-950"
                  : "border-border bg-background hover:bg-teal-50 dark:hover:bg-teal-950/40"
              )}
            >
              {t(`dashboard.ranges.${item.id}`)}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="dash-from" className="text-xs">
                {t("common.from")}
              </Label>
              <Input
                id="dash-from"
                type="date"
                value={customStart}
                onChange={(e) => onCustomStart(e.target.value)}
                className="h-8 w-auto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dash-to" className="text-xs">
                {t("common.to")}
              </Label>
              <Input
                id="dash-to"
                type="date"
                value={customEnd}
                onChange={(e) => onCustomEnd(e.target.value)}
                className="h-8 w-auto"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {generatedAt ? (
          <p className="text-[11px] text-muted-foreground">
            {t("dashboard.updated")}{" "}
            {new Date(generatedAt).toLocaleTimeString(
              i18n.language === "te" ? "te-IN" : "en-IN"
            )}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            data-icon="inline-start"
            className={cn(refreshing && "animate-spin")}
          />
          {t("common.refresh")}
        </Button>
      </div>
    </div>
  )
}
