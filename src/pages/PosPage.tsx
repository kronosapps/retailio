import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { ArrowLeft, Minus, Percent, Plus, Stamp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  calculateOrderTotals,
  clampDiscountPercent,
  discountConfig,
  getActiveOccasionDiscount,
} from "@/data/discounts"
import { peekNextInvoiceId } from "@/data/invoices"
import {
  buildPosCatalog,
  getPosCategories,
  getPosItemsByCategory,
} from "@/data/posCatalog"
import { InvoiceService } from "@/modules/invoice"
import {
  getPaymentSession,
  openPayment,
  PaymentDialog,
  subscribePaymentSession,
} from "@/modules/payment"
import {
  clearPosSession,
  POS_SESSION_COUNT,
  sessionItemCount,
  setActivePosSession,
  updateActivePosSession,
  updatePosSession,
  usePosSessions,
  type PosCartLine,
  type PosSessionId,
} from "@/modules/pos"
import { ReceiptDialog } from "@/modules/receipt"
import { ProductService } from "@/modules/products"
import { getLoyaltyRewardSummary, loyaltyConfig } from "@/data/loyalty"
import {
  LOYALTY_REWARD_ITEMS,
  getLoyaltyRewardItem,
  type LoyaltyRewardItem,
} from "@/data/loyalty-rewards"
import {
  formatMoney,
  toMenuVariant,
  type MenuData,
  type MenuItem,
  type MenuVariant,
  type MenuWeight,
} from "@/data/menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

const LOYALTY_CART_ID_PREFIX = "loyalty-reward__"
const SESSION_IDS = Array.from(
  { length: POS_SESSION_COUNT },
  (_, i) => (i + 1) as PosSessionId
)

function toLoyaltyCartVariant(reward: LoyaltyRewardItem): MenuVariant {
  const variant: MenuVariant = {
    id: `${LOYALTY_CART_ID_PREFIX}${reward.id}`,
    itemId: reward.id,
    name: reward.name,
    weight: reward.weight,
    price: 0,
    category: "Loyalty",
    color: reward.color,
  }
  if (reward.image) variant.image = reward.image
  return variant
}

function isMultiWeightItem(item: MenuItem) {
  return item.weights.length > 1
}

function WeightTile({
  item,
  weightOption,
  onAdd,
}: {
  item: MenuItem
  weightOption: MenuWeight
  onAdd: () => void
}) {
  const image = weightOption.image || item.image
  return (
    <button
      type="button"
      onClick={onAdd}
      className="relative flex min-h-[5.5rem] flex-col items-start justify-between overflow-hidden rounded-lg border border-black/10 p-2.5 text-left text-white shadow-sm transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: weightOption.color || item.color || "#44403c",
        backgroundImage: image
          ? `linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.2)), url("${image}")`
          : "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.2))",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <span className="relative z-10 text-xs font-semibold drop-shadow sm:text-sm">
        {weightOption.weight}
      </span>
      <span className="relative z-10 text-xs font-medium drop-shadow sm:text-sm">
        {formatMoney(weightOption.price)}
      </span>
    </button>
  )
}

function SingleProductCard({
  item,
  onAdd,
}: {
  item: MenuItem
  onAdd: (item: MenuItem, weight: MenuWeight) => void
}) {
  const weightOption = item.weights[0]
  if (!weightOption) return null
  const image = weightOption.image || item.image

  return (
    <button
      type="button"
      onClick={() => onAdd(item, weightOption)}
      className="relative flex min-h-40 flex-col items-stretch justify-end overflow-hidden rounded-xl border border-black/15 text-left text-white shadow-sm transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        backgroundColor: weightOption.color || item.color || "#44403c",
        backgroundImage: image
          ? `linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.2)), url("${image}")`
          : "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.35))",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="relative z-10 space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold drop-shadow sm:text-base">
          {item.name}
        </p>
        <p className="text-xs text-white/90 drop-shadow">{weightOption.weight}</p>
        <p className="text-sm font-semibold drop-shadow">
          {formatMoney(weightOption.price)}
        </p>
      </div>
    </button>
  )
}

export function PosPage() {
  const { userId, profile } = useAuth()
  const store = usePosSessions()
  const session = store.sessions[store.activeSessionId]
  const paymentOpen = useSyncExternalStore(
    subscribePaymentSession,
    () => getPaymentSession().open
  )

  const [catalog, setCatalog] = useState<MenuData>(() =>
    buildPosCatalog(ProductService.list())
  )
  const [catalogReady, setCatalogReady] = useState(
    () => ProductService.list().length > 0
  )
  const [invoiceTick, setInvoiceTick] = useState(0)
  const [switchBlocked, setSwitchBlocked] = useState(false)

  const {
    cart,
    applyOccasion,
    friendsFamilyPercent,
    discountTab,
    menuPanel,
    category,
    loyaltyMode,
    selectedLoyaltyRewardId,
    lastInvoiceId,
    chargeError,
  } = session

  const receiptOwnerId =
    SESSION_IDS.find((id) => store.sessions[id].receiptInvoiceId) ?? null
  const receiptInvoiceId = receiptOwnerId
    ? store.sessions[receiptOwnerId].receiptInvoiceId
    : null

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      try {
        const products = await ProductService.ensureCatalogSeeded(
          profile?.storeId ?? null,
          userId
        )
        if (cancelled) return
        setCatalog(buildPosCatalog(products))
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[RetailOS] POS catalog load failed", error)
        }
        if (!cancelled) {
          setCatalog(buildPosCatalog(ProductService.list()))
        }
      } finally {
        if (!cancelled) setCatalogReady(true)
      }
    }

    void loadCatalog()
    return () => {
      cancelled = true
    }
  }, [profile?.storeId, userId])

  const categories = useMemo(() => getPosCategories(catalog), [catalog])

  useEffect(() => {
    if (!categories.includes(category)) {
      updateActivePosSession({ category: "All" })
    }
  }, [categories, category])

  const switchBlockedMessage =
    paymentOpen && switchBlocked
      ? "Finish or cancel payment first"
      : null

  const activeOccasion = useMemo(() => getActiveOccasionDiscount(), [])
  const fnfMax = discountConfig.friendsAndFamily.maxPercent
  const fnfPresets = discountConfig.friendsAndFamily.presets
  const selectedLoyaltyReward = getLoyaltyRewardItem(selectedLoyaltyRewardId)
  const hasActiveDiscount =
    (applyOccasion && Boolean(activeOccasion)) || friendsFamilyPercent > 0
  const hasActiveLoyaltyPercent = loyaltyMode === "percent"
  const hasActiveLoyaltyItem =
    loyaltyMode === "item" && Boolean(selectedLoyaltyReward)
  const hasActiveLoyalty = hasActiveLoyaltyPercent || hasActiveLoyaltyItem

  const items = useMemo(
    () => getPosItemsByCategory(catalog, category),
    [catalog, category]
  )
  const multiWeightItems = useMemo(
    () => items.filter(isMultiWeightItem),
    [items]
  )
  const singleWeightItems = useMemo(
    () => items.filter((item) => !isMultiWeightItem(item)),
    [items]
  )

  const totals = useMemo(
    () =>
      calculateOrderTotals(
        cart.map((line) => ({
          unitPricePaisa: line.item.price,
          qty: line.qty,
        })),
        {
          applyOccasion,
          occasion: activeOccasion,
          friendsFamilyPercent,
          redeemLoyalty: hasActiveLoyaltyPercent,
        }
      ),
    [
      cart,
      applyOccasion,
      activeOccasion,
      friendsFamilyPercent,
      hasActiveLoyaltyPercent,
    ]
  )

  const itemCount = sessionItemCount(session)
  const nextInvoiceId = useMemo(() => {
    void invoiceTick
    return peekNextInvoiceId()
  }, [invoiceTick])

  function patchCart(nextCart: PosCartLine[]) {
    updateActivePosSession({ cart: nextCart })
  }

  function addWeight(item: MenuItem, weightOption: MenuWeight) {
    const variant = toMenuVariant(item, weightOption)
    const existing = cart.find(
      (line) => !line.isLoyaltyReward && line.item.id === variant.id
    )
    if (existing) {
      patchCart(
        cart.map((line) =>
          !line.isLoyaltyReward && line.item.id === variant.id
            ? { ...line, qty: line.qty + 1 }
            : line
        )
      )
      return
    }
    patchCart([...cart, { item: variant, qty: 1 }])
  }

  function setQty(variantId: string, qty: number) {
    if (qty <= 0) {
      patchCart(
        cart.filter((line) => line.isLoyaltyReward || line.item.id !== variantId)
      )
      return
    }
    patchCart(
      cart.map((line) =>
        !line.isLoyaltyReward && line.item.id === variantId
          ? { ...line, qty }
          : line
      )
    )
  }

  function cartWithLoyaltyReward(
    current: PosCartLine[],
    reward: LoyaltyRewardItem | null
  ): PosCartLine[] {
    const withoutLoyalty = current.filter((line) => !line.isLoyaltyReward)
    if (!reward) return withoutLoyalty
    return [
      ...withoutLoyalty,
      { item: toLoyaltyCartVariant(reward), qty: 1, isLoyaltyReward: true },
    ]
  }

  function clearLoyaltyReward() {
    updateActivePosSession({
      loyaltyMode: "off",
      selectedLoyaltyRewardId: null,
      cart: cartWithLoyaltyReward(cart, null),
    })
  }

  function chooseLoyaltyPercent() {
    updateActivePosSession({
      loyaltyMode: "percent",
      selectedLoyaltyRewardId: null,
      cart: cartWithLoyaltyReward(cart, null),
    })
  }

  function selectLoyaltyReward(rewardId: string) {
    const reward = getLoyaltyRewardItem(rewardId)
    if (!reward) return
    updateActivePosSession({
      loyaltyMode: "item",
      selectedLoyaltyRewardId: rewardId,
      cart: cartWithLoyaltyReward(cart, reward),
    })
  }

  function clearCart() {
    clearPosSession(store.activeSessionId)
  }

  function updateFriendsFamilyPercent(value: number) {
    updateActivePosSession({
      friendsFamilyPercent: clampDiscountPercent(value, fnfMax),
    })
  }

  function switchSession(id: PosSessionId) {
    if (id === store.activeSessionId) return
    if (paymentOpen) {
      setSwitchBlocked(true)
      return
    }
    setSwitchBlocked(false)
    setActivePosSession(id)
  }

  async function chargeOrder() {
    if (cart.length === 0) return
    const sessionId = store.activeSessionId
    updatePosSession(sessionId, { chargeError: null })

    try {
      const sale = await InvoiceService.create({
        cashierId: userId,
        cashierName: profile?.displayName || profile?.email || null,
        storeId: profile?.storeId ?? null,
        customerName: "Walk-in",
        lines: cart.map((line) => ({
          itemId: line.item.itemId,
          sku: line.item.sku || line.item.id,
          name: line.item.name,
          weight: line.item.weight,
          qty: line.qty,
          unitPricePaisa: line.item.price,
          lineTotalPaisa: line.item.price * line.qty,
          isLoyaltyReward: line.isLoyaltyReward,
        })),
        totals: {
          grossSubtotal: totals.grossSubtotal,
          friendsFamilyDiscount: totals.friendsFamilyDiscount,
          friendsFamilyPercent: totals.friendsFamilyPercent,
          occasionDiscount: totals.occasionDiscount,
          occasionPercent: totals.occasionPercent,
          occasionName: totals.occasionName,
          loyaltyDiscount: totals.loyaltyDiscount,
          loyaltyLabel: totals.loyaltyLabel,
          taxableAmount: totals.taxableAmount,
          gstAmount: totals.gstAmount,
          gstPercent: totals.gstPercent,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          cgstPercent: totals.cgstPercent,
          sgstPercent: totals.sgstPercent,
          total: totals.total,
        },
        loyalty: {
          mode: loyaltyMode,
          freeItemId: selectedLoyaltyReward?.id ?? null,
          freeItemName: selectedLoyaltyReward
            ? `${selectedLoyaltyReward.name} (${selectedLoyaltyReward.weight})`
            : null,
        },
      })

      updatePosSession(sessionId, { lastInvoiceId: sale.invoiceId })
      setInvoiceTick((tick) => tick + 1)

      openPayment(InvoiceService.toPayable(sale), {
        onPaid: (invoiceId) => {
          clearPosSession(sessionId)
          updatePosSession(sessionId, {
            lastInvoiceId: invoiceId,
            receiptInvoiceId: invoiceId,
          })
        },
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("[RetailOS] Charge failed", error)
      }
      updatePosSession(sessionId, {
        chargeError: "Could not start payment for this order. Try again.",
      })
    }
  }

  return (
    <>
      <PaymentDialog />
      <ReceiptDialog
        invoiceId={receiptInvoiceId}
        onClose={() => {
          if (receiptOwnerId) {
            updatePosSession(receiptOwnerId, { receiptInvoiceId: null })
          }
        }}
      />
      <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] lg:grid-cols-[minmax(280px,32%)_minmax(0,1fr)] lg:grid-rows-1">
        {/* Current order */}
        <aside className="flex min-h-0 flex-col border-b border-border bg-sidebar text-sidebar-foreground lg:border-r lg:border-b-0">
          <div className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">Current order</h2>
                <p className="text-xs text-muted-foreground">
                  Session {store.activeSessionId} · Invoice {nextInvoiceId}
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
                onClick={clearCart}
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
                const lane = store.sessions[id]
                const count = sessionItemCount(lane)
                const active = id === store.activeSessionId
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={paymentOpen && !active}
                    onClick={() => switchSession(id)}
                    className={cn(
                      "relative flex min-h-9 flex-col items-center justify-center rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
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
                    className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-2 ring-1 ring-border/60"
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
                      <p className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                        Free
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="size-9"
                            onClick={() => setQty(line.item.id, line.qty - 1)}
                            aria-label={`Decrease ${line.item.name} ${line.item.weight}`}
                          >
                            <Minus />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">
                            {line.qty}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="size-9"
                            onClick={() => setQty(line.item.id, line.qty + 1)}
                            aria-label={`Increase ${line.item.name} ${line.item.weight}`}
                          >
                            <Plus />
                          </Button>
                        </div>

                        <p className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                          {formatMoney(line.item.price * line.qty)}
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border p-3">
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
                    {totals.occasionName ?? "Occasion"} ({totals.occasionPercent}
                    %)
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
                <span className="font-medium text-foreground">
                  {lastInvoiceId}
                </span>
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
              onClick={() => void chargeOrder()}
            >
              Charge {formatMoney(totals.total)}
            </Button>
          </div>
        </aside>

        {/* Menu / Discounts / Loyalty (shared panel) */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">
                  {menuPanel === "discounts"
                    ? "Discounts"
                    : menuPanel === "loyalty"
                      ? loyaltyConfig.name
                      : "Menu"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {menuPanel === "discounts"
                    ? "Applied to the whole order"
                    : menuPanel === "loyalty"
                      ? "Offline punch cards — stamp in person"
                      : "Tap items to add to the order"}
                </p>
              </div>
              {menuPanel === "menu" ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateActivePosSession({ menuPanel: "discounts" })
                    }
                  >
                    <Percent data-icon="inline-start" />
                    Discount
                    {hasActiveDiscount ? (
                      <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        On
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateActivePosSession({ menuPanel: "loyalty" })
                    }
                  >
                    <Stamp data-icon="inline-start" />
                    Loyalty
                    {hasActiveLoyalty ? (
                      <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        On
                      </span>
                    ) : null}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => updateActivePosSession({ menuPanel: "menu" })}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Back to menu
                </Button>
              )}
            </div>

            {menuPanel === "menu" ? (
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => updateActivePosSession({ category: name })}
                    className={cn(
                      "min-h-9 shrink-0 rounded-md px-3 text-sm font-medium transition-colors active:scale-[0.98]",
                      category === name
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground hover:bg-muted/80"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {menuPanel === "discounts" ? (
              <div className="mx-auto w-full max-w-xl">
                <Tabs
                  value={discountTab}
                  onValueChange={(value) =>
                    updateActivePosSession({ discountTab: value })
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="occasion">Occasion</TabsTrigger>
                    <TabsTrigger value="friends-family">
                      Friends & Family
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="occasion" className="mt-3 space-y-3">
                    {activeOccasion ? (
                      <>
                        <div className="rounded-lg border border-border px-3 py-2">
                          <p className="text-sm font-medium">
                            {activeOccasion.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activeOccasion.percent}% off
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {activeOccasion.startsOn} to {activeOccasion.endsOn}
                          </p>
                          {activeOccasion.note ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {activeOccasion.note}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                          <Label htmlFor="apply-occasion" className="text-sm">
                            Apply to order
                          </Label>
                          <Switch
                            id="apply-occasion"
                            checked={applyOccasion}
                            onCheckedChange={(checked) =>
                              updateActivePosSession({
                                applyOccasion: checked,
                              })
                            }
                            disabled={cart.length === 0}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        No occasion discount is active. Edit{" "}
                        <code className="text-[11px]">
                          src/data/discounts.json
                        </code>
                        .
                      </p>
                    )}
                  </TabsContent>

                  <TabsContent value="friends-family" className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {discountConfig.friendsAndFamily.note}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateFriendsFamilyPercent(0)}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 text-xs",
                          friendsFamilyPercent === 0
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted"
                        )}
                      >
                        0%
                      </button>
                      {fnfPresets.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateFriendsFamilyPercent(preset)}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs",
                            friendsFamilyPercent === preset
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-muted"
                          )}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="fnf-custom" className="text-xs">
                        Custom % (max {fnfMax})
                      </Label>
                      <Input
                        id="fnf-custom"
                        type="number"
                        min={0}
                        max={fnfMax}
                        step={1}
                        value={friendsFamilyPercent}
                        onChange={(event) =>
                          updateFriendsFamilyPercent(Number(event.target.value))
                        }
                      />
                    </div>

                    {friendsFamilyPercent > 0 ? (
                      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {friendsFamilyPercent}% off whole order (−
                        {formatMoney(totals.friendsFamilyDiscount)})
                      </p>
                    ) : null}
                  </TabsContent>
                </Tabs>

                <div className="mt-4">
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() =>
                      updateActivePosSession({ menuPanel: "menu" })
                    }
                  >
                    Done — back to menu
                  </Button>
                </div>
              </div>
            ) : menuPanel === "loyalty" ? (
              <div className="mx-auto w-full max-w-xl space-y-4">
                <div className="rounded-lg border border-border px-3 py-3">
                  <p className="text-sm font-medium">{loyaltyConfig.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {loyaltyConfig.note}
                  </p>
                  <p className="mt-2 text-xs font-medium">
                    Reward: {getLoyaltyRewardSummary()}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">
                    Choose one reward for this order
                  </Label>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={chooseLoyaltyPercent}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                        loyaltyMode === "percent"
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <p className="text-sm font-medium">
                        {loyaltyConfig.percentReward.percent}% off the order
                      </p>
                      <p className="text-xs text-muted-foreground">
                        No free item — discount only
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Or choose one free item</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecting a free item replaces the percent discount.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LOYALTY_REWARD_ITEMS.map((reward) => {
                      const selected =
                        loyaltyMode === "item" &&
                        selectedLoyaltyRewardId === reward.id
                      return (
                        <button
                          key={reward.id}
                          type="button"
                          onClick={() => selectLoyaltyReward(reward.id)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-muted"
                          )}
                        >
                          <p className="text-sm font-medium">{reward.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {reward.weight} · worth {formatMoney(reward.value)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {hasActiveLoyaltyPercent ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {totals.loyaltyLabel}: −
                    {formatMoney(totals.loyaltyDiscount)} on this order
                  </p>
                ) : null}

                {hasActiveLoyaltyItem && selectedLoyaltyReward ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Free {selectedLoyaltyReward.name} (
                    {selectedLoyaltyReward.weight}) added to the order
                  </p>
                ) : null}

                {hasActiveLoyalty ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={clearLoyaltyReward}
                  >
                    Clear loyalty reward
                  </Button>
                ) : null}

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => updateActivePosSession({ menuPanel: "menu" })}
                >
                  Done — back to menu
                </Button>
              </div>
            ) : !catalogReady ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
                Loading products…
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                No products in this category
              </div>
            ) : (
              <div className="space-y-6">
                {multiWeightItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <h3 className="mb-2 text-sm font-semibold tracking-tight sm:text-base">
                      {item.name}
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "0.5rem",
                      }}
                    >
                      {item.weights.map((weightOption) => (
                        <WeightTile
                          key={
                            weightOption.sku ||
                            `${item.id}-${weightOption.weight}`
                          }
                          item={item}
                          weightOption={weightOption}
                          onAdd={() => addWeight(item, weightOption)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {singleWeightItems.length > 0 ? (
                  <div className="space-y-2" data-menu-layout="product-grid">
                    {multiWeightItems.length > 0 ? (
                      <h3 className="text-sm font-semibold text-muted-foreground">
                        Products
                      </h3>
                    ) : null}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(10.5rem, 1fr))",
                        gap: "0.75rem",
                        width: "100%",
                      }}
                    >
                      {singleWeightItems.map((item) => (
                        <SingleProductCard
                          key={item.id}
                          item={item}
                          onAdd={addWeight}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
