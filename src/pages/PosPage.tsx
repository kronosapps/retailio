import { useMemo, useState } from "react"
import { Minus, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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

export function PosPage() {
  const [category, setCategory] = useState<MenuCategory>("All")
  const [cart, setCart] = useState<CartLine[]>([])

  const items = useMemo(() => getMenuItemsByCategory(category), [category])

  const subtotal = cart.reduce(
    (sum, line) => sum + line.item.price * line.qty,
    0
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
  }

  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] md:grid-cols-[minmax(280px,32%)_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex min-h-0 flex-col border-b border-border bg-sidebar text-sidebar-foreground md:border-r md:border-b-0">
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
              Tap a weight to build the ticket
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
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(subtotal)}
            </span>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={cart.length === 0}
            onClick={clearCart}
          >
            Charge {formatMoney(subtotal)}
          </Button>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Menu</h2>
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No items in this category
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <h3 className="mb-2 text-sm font-semibold tracking-tight sm:text-base">
                    {item.name}
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {item.weights.map((weightOption) => {
                      const image =
                        weightOption.image || item.image || undefined
                      return (
                        <button
                          key={`${item.id}-${weightOption.weight}`}
                          type="button"
                          onClick={() => addWeight(item, weightOption)}
                          className="relative flex min-h-[5.5rem] flex-col items-start justify-between overflow-hidden rounded-lg border border-black/10 p-2.5 text-left text-white shadow-sm transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{
                            backgroundColor:
                              weightOption.color || item.color || "#e5e5e5",
                            backgroundImage: image
                              ? `linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.2)), url(${image})`
                              : undefined,
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
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
