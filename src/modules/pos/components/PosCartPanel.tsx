import { Minus, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/data/menu"
import { cn } from "@/lib/utils"
import {
  POS_SESSION_COUNT,
  sessionItemCount,
  type PosCartLine,
  type PosSession,
  type PosSessionId,
} from "@/modules/pos"

const SESSION_IDS = Array.from(
  { length: POS_SESSION_COUNT },
  (_, i) => (i + 1) as PosSessionId
)

export type PosCartTotals = {
  grossSubtotal: number
  friendsFamilyDiscount: number
  friendsFamilyPercent: number
  occasionDiscount: number
  occasionPercent: number
  occasionName: string | null
  loyaltyDiscount: number
  loyaltyLabel: string | null
  taxableAmount: number
  gstAmount: number
  sgstLabel: string
  sgstPercent: number
  sgstAmount: number
  cgstLabel: string
  cgstPercent: number
  cgstAmount: number
  total: number
}

type PosCartPanelProps = {
  activeSessionId: PosSessionId
  sessions: Record<PosSessionId, PosSession>
  cart: PosCartLine[]
  itemCount: number
  nextInvoiceId: string
  totals: PosCartTotals
  lastInvoiceId: string | null
  chargeError: string | null
  paymentOpen: boolean
  switchBlockedMessage: string | null
  onSwitchSession: (id: PosSessionId) => void
  onClearCart: () => void
  onSetQty: (itemId: string, qty: number) => void
  onCharge: () => void
  /** Extra classes on the root (e.g. sheet fill). */
  className?: string
}

/**
 * Shared cart / sessions / totals / charge — used by desktop aside and mobile sheet.
 */
export function PosCartPanel({
  activeSessionId,
  sessions,
  cart,
  itemCount,
  nextInvoiceId,
  totals,
  lastInvoiceId,
  chargeError,
  paymentOpen,
  switchBlockedMessage,
  onSwitchSession,
  onClearCart,
  onSetQty,
  onCharge,
  className,
}: PosCartPanelProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Current order</h2>
            <p className="text-xs text-muted-foreground">
              Session {activeSessionId} · Invoice {nextInvoiceId}
              {itemCount === 0
                ? " · No items yet"
                : ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cart.length === 0}
            onClick={onClearCart}
          >
            <Trash2 data-icon="inline-start" />
            Clear
          </Button>
        </div>

        <div
          className="grid grid-cols-3 gap-1.5"
          role="tablist"
          aria-label="POS sessions"
        >
          {SESSION_IDS.map((id) => {
            const lane = sessions[id]
            const count = sessionItemCount(lane)
            const active = id === activeSessionId
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={paymentOpen && !active}
                onClick={() => onSwitchSession(id)}
                className={cn(
                  "relative flex min-h-11 flex-col items-center justify-center rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/80",
                  paymentOpen && !active && "cursor-not-allowed opacity-50"
                )}
              >
                <span>Session {id}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "mt-0.5 rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-foreground"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {switchBlockedMessage ? (
          <p className="text-center text-[11px] text-destructive">
            {switchBlockedMessage}
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-28 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
            Tap menu items to build the ticket
          </div>
        ) : (
          <ul className="space-y-2">
            {cart.map((line) => (
              <li
                key={line.item.id}
                className="flex flex-col gap-2 rounded-lg bg-background px-2.5 py-2 ring-1 ring-border/60 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {line.item.name}
                    {line.isLoyaltyReward ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (Loyalty free)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {line.isLoyaltyReward
                      ? `${line.item.weight} · Free`
                      : `${line.item.weight} · ${formatMoney(line.item.price)} each`}
                  </p>
                </div>

                {line.isLoyaltyReward ? (
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums sm:w-16">
                    Free
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-2 sm:contents">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="size-11 sm:size-9"
                        onClick={() => onSetQty(line.item.id, line.qty - 1)}
                        aria-label={`Decrease ${line.item.name} ${line.item.weight}`}
                      >
                        <Minus />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">
                        {line.qty}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="size-11 sm:size-9"
                        onClick={() => onSetQty(line.item.id, line.qty + 1)}
                        aria-label={`Increase ${line.item.name} ${line.item.weight}`}
                      >
                        <Plus />
                      </Button>
                    </div>

                    <p className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatMoney(line.item.price * line.qty)}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">
              {formatMoney(totals.grossSubtotal)}
            </span>
          </div>
          {totals.friendsFamilyDiscount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Friends & Family ({totals.friendsFamilyPercent}%)</span>
              <span className="tabular-nums">
                −{formatMoney(totals.friendsFamilyDiscount)}
              </span>
            </div>
          ) : null}
          {totals.occasionDiscount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>
                {totals.occasionName ?? "Occasion"} ({totals.occasionPercent}%)
              </span>
              <span className="tabular-nums">
                −{formatMoney(totals.occasionDiscount)}
              </span>
            </div>
          ) : null}
          {totals.loyaltyDiscount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{totals.loyaltyLabel ?? "Loyalty"}</span>
              <span className="tabular-nums">
                −{formatMoney(totals.loyaltyDiscount)}
              </span>
            </div>
          ) : null}
          {cart.length > 0 && totals.gstAmount > 0 ? (
            <>
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Taxable value</span>
                <span className="tabular-nums">
                  {formatMoney(totals.taxableAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>
                  {totals.sgstLabel} ({totals.sgstPercent}%)
                </span>
                <span className="tabular-nums">
                  {formatMoney(totals.sgstAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>
                  {totals.cgstLabel} ({totals.cgstPercent}%)
                </span>
                <span className="tabular-nums">
                  {formatMoney(totals.cgstAmount)}
                </span>
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total)}</span>
          </div>
          {cart.length > 0 && totals.gstAmount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Inclusive of {totals.sgstLabel} {totals.sgstPercent}% +{" "}
              {totals.cgstLabel} {totals.cgstPercent}% — charge unchanged
            </p>
          ) : null}
        </div>

        {lastInvoiceId && cart.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Recorded as{" "}
            <span className="font-medium text-foreground">{lastInvoiceId}</span>
          </p>
        ) : null}
        {chargeError ? (
          <p className="text-center text-xs text-destructive">{chargeError}</p>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base"
          disabled={cart.length === 0}
          onClick={onCharge}
        >
          Charge {formatMoney(totals.total)}
        </Button>
      </div>
    </div>
  )
}
