import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { useNotificationAnalytics } from "../hooks/useNotificationAnalytics"

export function NotificationAnalyticsCards() {
  const stats = useNotificationAnalytics()

  const cards = [
    { label: "WhatsApp sent today", value: String(stats.sentToday) },
    { label: "Failed messages", value: String(stats.failed) },
    { label: "Pending queue", value: String(stats.pendingQueue) },
    {
      label: "Delivery rate",
      value: `${stats.deliveryRate.toFixed(0)}%`,
    },
    { label: "Read rate", value: `${stats.readRate.toFixed(0)}%` },
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        Notification analytics
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} size="sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
