import { useMemo, useState } from "react"
import { Minus, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  MENU_CATEGORIES,
  formatMoney,
  getMenuItemsByCategory,
  type MenuCategory,
  type MenuItem,
} from "@/data/menu"
import { cn } from "@/lib/utils"

type CartLine = {
  item: MenuItem
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

  function addItem(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === item.id)
      if (existing) {
        return prev.map((line) =>
          line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line
        )
      }
      return [...prev, { item, qty: 1 }]
    })
  }

  function setQty(itemId: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((line) => line.item.id !== itemId)
      return prev.map((line) =>
        line.item.id === itemId ? { ...line, qty } : line
      )
    })
  }

  function clearCart() {
    setCart([])
  }

  return (
    <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] md:grid-cols-[minmax(280px,32%)_minmax(0,1fr)] md:grid-rows-1">
      {/* Current order */}
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
                      {formatMoney(line.item.price)} each
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="size-9"
                      onClick={() => setQty(line.item.id, line.qty - 1)}
                      aria-label={`Decrease ${line.item.name}`}
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
                      aria-label={`Increase ${line.item.name}`}
                    >
                      <Plus />
                    </Button>
                  </div>

                  <p className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
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

      {/* Menu */}
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
            <div className="grid grid-cols-4 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item)}
                  className="flex aspect-[4/3] min-h-0 flex-col items-start justify-between rounded-lg border border-black/10 p-2.5 text-left shadow-sm transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-3"
                  style={{
                    backgroundColor: item.color || "#e5e5e5",
                    color: "#171717",
                  }}
                >
                  <span className="line-clamp-2 text-xs font-semibold leading-snug sm:text-sm">
                    {item.name}
                  </span>
                  <span className="text-xs font-medium opacity-80 sm:text-sm">
                    {formatMoney(item.price)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
