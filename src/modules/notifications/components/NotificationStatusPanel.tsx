import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { useNotification } from "../hooks/useNotification"
import type { NotificationStatus } from "../types/notification"

const tone: Record<NotificationStatus, string> = {
  Pending: "bg-muted text-muted-foreground border-border",
  Queued: "bg-orange-100 text-orange-800 border-orange-200",
  Sending: "bg-sky-100 text-sky-800 border-sky-200",
  Sent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Delivered: "bg-emerald-100 text-emerald-900 border-emerald-300",
  Read: "bg-teal-100 text-teal-900 border-teal-300",
  Failed: "bg-red-100 text-red-800 border-red-200",
  Cancelled: "bg-stone-200 text-stone-700 border-stone-300",
}

export function NotificationStatusPanel({
  invoiceId,
  customerName,
  customerPhone,
  paymentId,
  customerId,
  storeId,
}: {
  invoiceId: string
  customerName: string
  customerPhone?: string | null
  paymentId?: string | null
  customerId?: string | null
  storeId?: string | null
}) {
  const { notification, busy, error, retry, sendAgain } =
    useNotification(invoiceId)

  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">WhatsApp receipt</CardTitle>
        <CardDescription>
          Status from the Notification Engine (Cloud Functions deliver the
          message — credentials never touch the browser).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!notification ? (
          <p className="text-sm text-muted-foreground">
            No WhatsApp notification queued yet. Paid sales with a customer
            mobile auto-queue after payment.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  tone[notification.status]
                )}
              >
                {notification.status}
              </span>
              <span className="text-xs text-muted-foreground">
                {notification.channel} · {notification.messageType}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Last sent:{" "}
              {notification.sentAt
                ? new Date(notification.sentAt).toLocaleString("en-IN")
                : "—"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              Message ID: {notification.messageId || "—"}
            </p>
            {notification.error ? (
              <p className="text-xs text-destructive">{notification.error}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Retries: {notification.retryCount}/3
            </p>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !notification || notification.retryCount >= 3}
            onClick={() => void retry()}
          >
            Retry
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void sendAgain({
                customerName,
                customerPhone: customerPhone ?? null,
                paymentId,
                customerId,
                storeId,
              })
            }
          >
            Send again
          </Button>
          {notification?.receiptUrl ? (
            <a
              href={notification.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm hover:bg-muted"
            >
              View receipt
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
