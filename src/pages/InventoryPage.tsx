import { useEffect, useMemo, useState, type FormEvent } from "react"
import { PackagePlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatPackLabel } from "@/data/posCatalog"
import {
  InventoryService,
  type InventoryRecord,
} from "@/modules/inventory"
import { ProductService, type ProductRecord } from "@/modules/products"
import { cn } from "@/lib/utils"
import { useAuth } from "@/providers/AuthProvider"

type FormState = {
  selectedSku: string
  productId: string
  name: string
  sku: string
  quantity: string
  unit: string
  category: string
  notes: string
}

const EMPTY_FORM: FormState = {
  selectedSku: "",
  productId: "",
  name: "",
  sku: "",
  quantity: "",
  unit: "",
  category: "",
  notes: "",
}

const selectClassName = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "md:text-sm dark:bg-input/30"
)

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

function productOptionLabel(product: ProductRecord): string {
  const pack = formatPackLabel(product.unitSize)
  return `${product.name} · ${pack} (${product.sku})`
}

export function InventoryPage() {
  const { userId, profile } = useAuth()
  const [items, setItems] = useState<InventoryRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function refreshInventory() {
    setItems(InventoryService.list())
  }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const [catalog] = await Promise.all([
          ProductService.ensureCatalogSeeded(
            profile?.storeId ?? null,
            userId
          ),
          InventoryService.ensureSamples(profile?.storeId ?? null, userId),
        ])
        if (cancelled) return
        setProducts(catalog.filter((p) => p.active !== false))
        refreshInventory()
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[RetailOS] Inventory page boot failed", err)
        }
        if (!cancelled) {
          setProducts(ProductService.list().filter((p) => p.active !== false))
          refreshInventory()
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [profile?.storeId, userId])

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      })
      if (byName !== 0) return byName
      return a.unitSize - b.unitSize
    })
  }, [products])

  function onProductSelect(sku: string) {
    if (!sku) {
      setForm((f) => ({
        ...EMPTY_FORM,
        quantity: f.quantity,
        notes: f.notes,
      }))
      return
    }

    const product = products.find((p) => p.sku === sku)
    if (!product) return

    setForm((f) => ({
      ...f,
      selectedSku: product.sku,
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      unit: formatPackLabel(product.unitSize),
      category: product.category,
    }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!form.selectedSku || !form.name.trim() || !form.sku.trim()) {
      setError("Select a product from the catalog.")
      return
    }

    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("Quantity must be zero or a positive number.")
      return
    }

    setBusy(true)
    try {
      await InventoryService.create(
        {
          name: form.name.trim(),
          sku: form.sku.trim(),
          productId: form.productId,
          quantity,
          unit: form.unit,
          category: form.category,
          notes: form.notes,
          storeId: profile?.storeId ?? null,
        },
        userId
      )
      setForm(EMPTY_FORM)
      refreshInventory()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[RetailOS] Add inventory failed", err)
      }
      setError("Could not add inventory item. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(item: InventoryRecord) {
    const ok = window.confirm(
      `Remove “${item.name}” from inventory? This cannot be undone.`
    )
    if (!ok) return

    setDeletingId(item.id)
    setError(null)
    try {
      await InventoryService.delete(item.id)
      refreshInventory()
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[RetailOS] Delete inventory failed", err)
      }
      setError("Could not delete that item. Try again.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Pick a product from the catalog, enter quantity, and save. Changes go
          to local storage, Firestore, and the Inventory Google Sheet.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <PackagePlus className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Add inventory
          </h2>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="inv-product">Product</Label>
            <select
              id="inv-product"
              className={selectClassName}
              value={form.selectedSku}
              onChange={(e) => onProductSelect(e.target.value)}
              required
            >
              <option value="">
                {sortedProducts.length === 0
                  ? "Loading products…"
                  : "Select a product…"}
              </option>
              {sortedProducts.map((product) => (
                <option key={product.sku} value={product.sku}>
                  {productOptionLabel(product)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              value={form.name}
              readOnly
              placeholder="Select a product"
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-sku">SKU</Label>
            <Input
              id="inv-sku"
              value={form.sku}
              readOnly
              placeholder="Auto-filled"
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-category">Category</Label>
            <Input
              id="inv-category"
              value={form.category}
              readOnly
              placeholder="Auto-filled"
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-unit">Unit / pack</Label>
            <Input
              id="inv-unit"
              value={form.unit}
              readOnly
              placeholder="Auto-filled"
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-qty">Quantity</Label>
            <Input
              id="inv-qty"
              type="number"
              min={0}
              step="any"
              value={form.quantity}
              onChange={(e) =>
                setForm((f) => ({ ...f, quantity: e.target.value }))
              }
              placeholder="0"
              required
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="inv-notes">Notes</Label>
            <Input
              id="inv-notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Optional supplier or usage note"
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Button
              type="submit"
              disabled={busy || !form.selectedSku || sortedProducts.length === 0}
            >
              {busy ? "Saving…" : "Add to inventory"}
            </Button>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Name, SKU, category, and pack size come from the product
                catalog.
              </p>
            )}
          </div>
        </form>
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Stock on hand
          </h2>
          <p className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No inventory yet. Add your first item above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 font-medium">Qty</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                  <th className="px-3 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium">{item.name}</div>
                      {item.notes ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {item.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {item.sku || "—"}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {item.category || "—"}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {formatWhen(item.updatedAt)}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === item.id}
                        onClick={() => void onDelete(item)}
                      >
                        <Trash2 data-icon="inline-start" />
                        {deletingId === item.id ? "Removing…" : "Delete"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
