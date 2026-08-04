import { useMemo, useState } from "react"
import { ArrowLeft, Minus, Percent, Plus, Trash2 } from "lucide-react"

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
import {
  MENU_CATEGORIES,
  formatMoney,
  getMenuItemsByCategory,
  toMenuVariant,
  type MenuCategory,
  type MenuItem,
  type MenuVariant,
  type MenuWeight,
} from "@/data/menu"
import { cn } from "@/lib/utils"

type CartLine = {
  item: MenuVariant
  qty: number
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
  const [category, setCategory] = useState<MenuCategory>("All")
  const [cart, setCart] = useState<CartLine[]>([])
  const [applyOccasion, setApplyOccasion] = useState(false)
  const [friendsFamilyPercent, setFriendsFamilyPercent] = useState(0)
  const [discountTab, setDiscountTab] = useState("occasion")
  const [showDiscounts, setShowDiscounts] = useState(false)

  const activeOccasion = useMemo(() => getActiveOccasionDiscount(), [])
  const fnfMax = discountConfig.friendsAndFamily.maxPercent
  const fnfPresets = discountConfig.friendsAndFamily.presets
  const hasActiveDiscount =
    (applyOccasion && Boolean(activeOccasion)) || friendsFamilyPercent > 0

  const items = useMemo(() => getMenuItemsByCategory(category), [category])
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
        }
      ),
    [cart, applyOccasion, activeOccasion, friendsFamilyPercent]
  )

  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0)

  function addWeight(item: MenuItem, weightOption: MenuWeight) {
    const variant = toMenuVariant(item, weightOption)
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === variant.id)
      if (existing) {
        return prev.map((line) =>
          line.item.id === variant.id ? { ...line, qty: line.qty + 1 } : line
        )
      }
      return [...prev, { item: variant, qty: 1 }]
    })
  }

  function setQty(variantId: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((line) => line.item.id !== variantId)
      return prev.map((line) =>
        line.item.id === variantId ? { ...line, qty } : line
      )
    })
  }

  function clearCart() {
    setCart([])
    setApplyOccasion(false)
    setFriendsFamilyPercent(0)
  }

  function updateFriendsFamilyPercent(value: number) {
    setFriendsFamilyPercent(clampDiscountPercent(value, fnfMax))
  }

  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] lg:grid-cols-[minmax(280px,32%)_minmax(0,1fr)] lg:grid-rows-1">
      {/* Current order */}
      <aside className="flex min-h-0 flex-col border-b border-border bg-sidebar text-sidebar-foreground lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Current order</h2>
            <p className="text-xs text-muted-foreground">
              {itemCount === 0
                ? "No items yet"
                : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
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
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.item.weight} · {formatMoney(line.item.price)} each
                    </p>
                  </div>

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
                    {totals.gstLabel} ({totals.gstPercent}%)
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(totals.gstAmount)}
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
                Inclusive of {totals.gstLabel} — charge unchanged
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={cart.length === 0}
            onClick={clearCart}
          >
            Charge {formatMoney(totals.total)}
          </Button>
        </div>
      </aside>

      {/* Menu / Discounts (shared panel) */}
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {showDiscounts ? "Discounts" : "Menu"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {showDiscounts
                  ? "Applied to the whole order"
                  : "Tap items to add to the order"}
              </p>
            </div>
            <Button
              type="button"
              variant={showDiscounts ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowDiscounts((open) => !open)}
            >
              {showDiscounts ? (
                <>
                  <ArrowLeft data-icon="inline-start" />
                  Back to menu
                </>
              ) : (
                <>
                  <Percent data-icon="inline-start" />
                  Discount
                  {hasActiveDiscount ? (
                    <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      On
                    </span>
                  ) : null}
                </>
              )}
            </Button>
          </div>

          {!showDiscounts ? (
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {MENU_CATEGORIES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
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
          {showDiscounts ? (
            <div className="mx-auto w-full max-w-xl">
              <Tabs value={discountTab} onValueChange={setDiscountTab}>
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
                          onCheckedChange={setApplyOccasion}
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
                  onClick={() => setShowDiscounts(false)}
                >
                  Done — back to menu
                </Button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No items in this category
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
                        key={`${item.id}-${weightOption.weight}`}
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
  )
}
