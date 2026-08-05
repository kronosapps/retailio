import { Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"
import type { BusinessInsight } from "../types/dashboard"

export function BusinessInsights({ insights }: { insights: BusinessInsight[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Business insights
        </h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm",
              insight.tone === "positive" &&
                "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
              insight.tone === "warning" &&
                "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50",
              insight.tone === "neutral" &&
                "border-border bg-card text-card-foreground"
            )}
          >
            {insight.message}
          </div>
        ))}
      </div>
    </section>
  )
}
