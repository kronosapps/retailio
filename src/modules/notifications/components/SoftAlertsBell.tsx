import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckCheck, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useStaffAlerts } from "../hooks/useStaffAlerts"
import { buildAlertHref } from "../alertDeepLinks"
import type {
  AlertTone,
  NotificationPriority,
  NotificationRecord,
} from "../types/notification"
import {
  alertLabel,
  alertToneFor,
} from "../types/notification"

const TONE_STYLES: Record<
  AlertTone,
  { card: string; dot: string; chip: string }
> = {
  rose: {
    card: "border-rose-200/80 bg-rose-50/90 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/35 dark:text-rose-50",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-800 dark:text-rose-100",
  },
  amber: {
    card: "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-50",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  },
  violet: {
    card: "border-violet-200/80 bg-violet-50/90 text-violet-950 dark:border-violet-900/40 dark:bg-violet-950/35 dark:text-violet-50",
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
  },
  sky: {
    card: "border-sky-200/80 bg-sky-50/90 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/35 dark:text-sky-50",
    dot: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  },
  slate: {
    card: "border-slate-200/80 bg-slate-50/90 text-slate-900 dark:border-slate-700/50 dark:bg-slate-900/40 dark:text-slate-50",
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-800 dark:text-slate-100",
  },
  emerald: {
    card: "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-50",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  },
}

function alertBody(n: NotificationRecord): string {
  const metaBody = n.meta?.body
  if (typeof metaBody === "string" && metaBody.trim()) return metaBody
  return n.title || alertLabel(n.messageType)
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function SoftAlertCard({
  alert,
  onOpen,
}: {
  alert: NotificationRecord
  onOpen: (alert: NotificationRecord) => void
}) {
  const tone = alertToneFor(
    alert.messageType,
    (alert.priority as NotificationPriority) || "medium"
  )
  const styles = TONE_STYLES[tone]
  const unread = !alert.readAt

  return (
    <button
      type="button"
      onClick={() => onOpen(alert)}
      className={cn(
        "w-full rounded-2xl border px-3.5 py-3 text-left transition-[transform,opacity,box-shadow] duration-200",
        "hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        styles.card,
        unread ? "opacity-100" : "opacity-70"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            styles.dot,
            !unread && "opacity-40"
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold tracking-tight">
              {alert.title || alertLabel(alert.messageType)}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-current/55">
              {relativeTime(alert.createdAt)}
            </span>
          </div>
          <p className="text-[13px] leading-snug text-current/80">
            {alertBody(alert)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                styles.chip
              )}
            >
              {alertLabel(alert.messageType)}
            </span>
            {alert.priority === "critical" || alert.priority === "high" ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase",
                  styles.chip
                )}
              >
                {alert.priority}
              </span>
            ) : null}
            {unread ? (
              <span className="text-[10px] font-medium tracking-wide text-current/60 uppercase">
                New
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}

/**
 * Soft, color-coded staff alerts — bell + slide-over inbox.
 */
export function SoftAlertsBell({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { alerts, unreadCount, busy, markRead, markAllRead, rescan } =
    useStaffAlerts()

  const onOpenAlert = async (alert: NotificationRecord) => {
    if (!alert.readAt) await markRead(alert.notificationId)
    const href = buildAlertHref({
      messageType: alert.messageType,
      invoiceId: alert.invoiceId,
      customerId: alert.customerId,
      meta: alert.meta,
    })
    setOpen(false)
    if (href) navigate(href)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("relative shrink-0", className)}
        onClick={() => setOpen(true)}
        aria-label={
          unreadCount > 0
            ? `Alerts, ${unreadCount} unread`
            : "Alerts"
        }
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-[min(100%,24rem)] flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-4 text-left">
            <SheetTitle className="text-base">Alerts</SheetTitle>
            <SheetDescription>
              Soft ops signals — stock, cash, sync, and receivables.
            </SheetDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                <CheckCheck data-icon="inline-start" />
                Mark all read
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void rescan()}
              >
                <RefreshCw data-icon="inline-start" />
                Rescan
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm font-medium">All quiet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stock, payments, and sync look healthy for now.
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <SoftAlertCard
                  key={alert.notificationId}
                  alert={alert}
                  onOpen={(a) => void onOpenAlert(a)}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
