import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Responsive list shell: card stack on phone, table (or other) from md up.
 */
export function ResponsiveList({
  cards,
  table,
  className,
}: {
  cards: ReactNode
  table: ReactNode
  className?: string
}) {
  return (
    <div className={cn(className)}>
      <div className="space-y-2 md:hidden">{cards}</div>
      <div className="hidden md:block">{table}</div>
    </div>
  )
}

export function MobileListCard({
  title,
  meta,
  badge,
  actions,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background p-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{title}</div>
          {meta ? (
            <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
