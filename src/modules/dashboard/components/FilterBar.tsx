import { RefreshCw } from "lucide-react"

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
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Period
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
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="dash-from" className="text-xs">
                From
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
                To
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
            Updated {new Date(generatedAt).toLocaleTimeString("en-IN")}
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
          Refresh
        </Button>
      </div>
    </div>
  )
}
