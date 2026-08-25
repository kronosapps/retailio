import {
  CheckCircle2,
  Clock3,
  MessageCircle,
  Percent,
  XCircle,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  DASHBOARD_ACCENT,
  type DashboardAccent,
} from "@/modules/dashboard/components/palette"

import { useNotificationAnalytics } from "../hooks/useNotificationAnalytics"

export function NotificationAnalyticsCards() {
  const { t } = useTranslation()
  const stats = useNotificationAnalytics()

  const cards: Array<{
    label: string
    value: string
    accent: DashboardAccent
    icon: typeof MessageCircle
  }> = [
    {
      label: t("notifications.whatsappSentToday"),
      value: String(stats.sentToday),
      accent: "emerald",
      icon: MessageCircle,
    },
    {
      label: t("notifications.failedMessages"),
      value: String(stats.failed),
      accent: "rose",
      icon: XCircle,
    },
    {
      label: t("notifications.pendingQueue"),
      value: String(stats.pendingQueue),
      accent: "amber",
      icon: Clock3,
    },
    {
      label: t("notifications.deliveryRate"),
      value: `${stats.deliveryRate.toFixed(0)}%`,
      accent: "sky",
      icon: CheckCircle2,
    },
    {
      label: t("notifications.readRate"),
      value: `${stats.readRate.toFixed(0)}%`,
      accent: "cyan",
      icon: Percent,
    },
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-emerald-900 uppercase dark:text-emerald-200">
        {t("dashboard.notificationAnalytics")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const tone = DASHBOARD_ACCENT[card.accent]
          const Icon = card.icon
          return (
            <Card
              key={card.label}
              size="sm"
              className={cn("overflow-hidden shadow-none", tone.card)}
            >
              <CardHeader className="pb-1">
                <CardTitle
                  className={cn(
                    "flex items-center justify-between gap-2 text-xs font-medium",
                    tone.label
                  )}
                >
                  {card.label}
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-lg",
                      tone.iconWrap
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    tone.value
                  )}
                >
                  {card.value}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
