import { Minus, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatMoney } from "@/data/menu"
import { cn } from "@/lib/utils"
import type { PosCartLine } from "@/modules/pos"

export type PosCartTotals = {
  grossSubtotal: number
  promotionalDiscount?: number
  friendsFamilyDiscount: number
  friendsFamilyPercent: number
  occasionDiscount: number
  occasionPercent: number
  occasionName: string | null
  loyaltyDiscount: number
  loyaltyLabel: string | null
  couponDiscount?: number
  couponCode?: string | null
  pointsDiscount?: number
  pointsRedeemed?: number
  taxableAmount: number
  gstAmount: number
  gstPercent?: number
  sgstLabel: string
  sgstPercent: number
  sgstAmount: number
  cgstLabel: string
  cgstPercent: number
  cgstAmount: number
  igstAmount?: number
  igstPercent?: number
  total: number
}

type PosCartPanelProps = {
  cart: PosCartLine[]
  itemCount: number
  nextInvoiceId: string
  totals: PosCartTotals
  lastInvoiceId: string | null
  chargeError: string | null
  onClearCart: () => void
  onSetQty: (itemId: string, qty: number) => void
  onCharge: () => void
  /** Extra classes on the root (e.g. sheet fill). */
  className?: string
}

function discountTotal(totals: PosCartTotals): number {
  return (
    (totals.promotionalDiscount ?? 0) +
    (totals.couponDiscount ?? 0) +
    (totals.pointsDiscount ?? 0) +
    totals.friendsFamilyDiscount +
    totals.occasionDiscount +
    totals.loyaltyDiscount
  )
}

/**
 * Clean billing panel — ticket lines + total + charge only.
 * Sessions / customer live in the POS header toolbar.
 */
export function PosCartPanel({
  cart,
  itemCount,
  nextInvoiceId,
  totals,
  lastInvoiceId,
  chargeError,
  onClearCart,
  onSetQty,
  onCharge,
  className,
}: PosCartPanelProps) {
  const discounts = discountTotal(totals)

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Bill</h2>
          <p className="truncate text-xs text-muted-foreground">
            {nextInvoiceId}
            {itemCount === 0
              ? " · Empty"
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-28 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
            Tap menu items to add to the bill
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
                        (Free)
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

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <div className="space-y-1 text-sm">
          {discounts > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discounts</span>
              <span className="tabular-nums">−{formatMoney(discounts)}</span>
            </div>
          ) : null}
          {cart.length > 0 && totals.gstAmount > 0 ? (
            <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Taxable</span>
                <span className="tabular-nums">
                  {formatMoney(totals.taxableAmount)}
                </span>
              </div>
              {(totals.igstAmount ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <span>IGST ({totals.igstPercent ?? totals.gstPercent}%)</span>
                  <span className="tabular-nums">
                    {formatMoney(totals.igstAmount ?? 0)}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span>
                      {totals.sgstLabel} ({totals.sgstPercent}%)
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(totals.sgstAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      {totals.cgstLabel} ({totals.cgstPercent}%)
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(totals.cgstAmount)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : null}
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totals.total)}</span>
          </div>
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
