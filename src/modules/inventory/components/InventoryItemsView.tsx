import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Pencil, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  InventoryService,
  stockStatusLabel,
  type StockRow,
  type StockStatus,
} from "@/modules/inventory"
import {
  ProductError,
  ProductService,
  type ProductRecord,
} from "@/modules/products"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

import { StockActionDialogs } from "@/modules/inventory/components/StockActionDialogs"
import { ItemDetailPanel } from "@/modules/inventory/components/ItemDetailPanel"

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  barcode: z.string().trim().optional(),
  category: z.string().trim().min(1, "Category is required"),
  unitSize: z.string().trim().min(1, "Unit is required"),
  costPrice: z.string().trim().optional(),
  sellingPrice: z.string().trim().min(1, "Selling price is required"),
  gstRate: z.string().trim().min(1, "GST is required"),
  reorderLevel: z.string().trim().min(1, "Reorder level is required"),
  active: z.boolean(),
})

type ItemFormValues = z.infer<typeof itemSchema>

function parseNonNeg(label: string, raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  return n
}

function parsePositive(label: string, raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return n
}

const selectClassName = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
)

function statusBadge(status: StockStatus) {
  const label = stockStatusLabel(status)
  const color =
    status === "out_of_stock"
      ? "bg-red-100 text-red-800"
      : status === "low_stock"
        ? "bg-amber-100 text-amber-900"
        : "bg-emerald-100 text-emerald-900"
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", color)}>
      {label}
    </span>
  )
}

export function InventoryItemsView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "active"
  )
  const [stockFilter, setStockFilter] = useState<"all" | StockStatus>("all")
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ProductRecord | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [stockAction, setStockAction] = useState<{
    sku: string
    mode: "add" | "adjust"
  } | null>(null)

  const refresh = () => setTick((n) => n + 1)

  const stockRows = useMemo(() => {
    void tick
    return InventoryService.getAllStock({ includeInactive: true })
  }, [tick])

  const categories = useMemo(() => {
    void tick
    const fromCats = InventoryService.listCategories()
      .filter((c) => c.active)
      .map((c) => c.name)
    const fromStock = stockRows.map((r) => r.category)
    return [...new Set([...fromCats, ...fromStock])].sort()
  }, [tick, stockRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return stockRows.filter((row) => {
      if (category !== "all" && row.category !== category) return false
      if (activeFilter === "active" && !row.active) return false
      if (activeFilter === "inactive" && row.active) return false
      if (stockFilter !== "all" && row.status !== stockFilter) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        (row.barcode || "").toLowerCase().includes(q)
      )
    })
  }, [stockRows, search, category, activeFilter, stockFilter])

  const selected = selectedSku
    ? stockRows.find((r) => r.sku === selectedSku) ?? null
    : null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      category: categories[0] || "Uncategorized",
      unitSize: "1",
      costPrice: "",
      sellingPrice: "0",
      gstRate: "5",
      reorderLevel: "10",
      active: true,
    },
  })

  function openCreate() {
    setEditing(null)
    setFormError(null)
    reset({
      name: "",
      sku: "",
      barcode: "",
      category: categories[0] || "Uncategorized",
      unitSize: "1",
      costPrice: "",
      sellingPrice: "0",
      gstRate: "5",
      reorderLevel: "10",
      active: true,
    })
    setEditorOpen(true)
  }

  function openEdit(row: StockRow) {
    const product = ProductService.getById(row.sku)
    if (!product) return
    setEditing(product)
    setFormError(null)
    reset({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || "",
      category: product.category,
      unitSize: String(product.unitSize),
      costPrice:
        product.purchasePrice == null ? "" : String(product.purchasePrice),
      sellingPrice: String(product.sellingPrice),
      gstRate: String(product.gstRate),
      reorderLevel: String(product.reorderLevel),
      active: product.active,
    })
    setEditorOpen(true)
  }

  async function onSubmit(values: ItemFormValues) {
    setFormError(null)
    try {
      const unitSize = parsePositive("Unit size", values.unitSize)
      const sellingPrice = parseNonNeg("Selling price", values.sellingPrice)
      const gstRate = parseNonNeg("GST", values.gstRate)
      const reorderLevel = parseNonNeg("Reorder level", values.reorderLevel)
      const costPrice =
        values.costPrice && values.costPrice.trim()
          ? parseNonNeg("Cost price", values.costPrice)
          : null

      if (editing) {
        await ProductService.update({
          id: editing.id,
          name: values.name,
          barcode: values.barcode || null,
          category: values.category,
          unitSize,
          costPrice,
          sellingPrice,
          gstRate,
          reorderLevel,
          active: values.active,
          actorId: userId,
        })
      } else {
        await ProductService.create({
          name: values.name,
          sku: values.sku,
          barcode: values.barcode || null,
          category: values.category,
          unitSize,
          costPrice,
          sellingPrice,
          gstRate,
          reorderLevel,
          active: values.active,
          storeId: profile?.storeId ?? null,
          actorId: userId,
        })
      }
      setEditorOpen(false)
      refresh()
    } catch (err) {
      setFormError(
        err instanceof ProductError || err instanceof Error
          ? err.message
          : "Could not save item."
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, SKU, barcode…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={cn(selectClassName, "w-auto")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClassName, "w-auto")}
            value={activeFilter}
            onChange={(e) =>
              setActiveFilter(e.target.value as typeof activeFilter)
            }
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className={cn(selectClassName, "w-auto")}
            value={stockFilter}
            onChange={(e) =>
              setStockFilter(e.target.value as typeof stockFilter)
            }
          >
            <option value="all">All stock</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            Add item
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Barcode</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">Reorder</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.sku}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={() => setSelectedSku(row.sku)}
                  >
                    {row.name}
                  </button>
                  {!row.active && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.barcode || "—"}
                </td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">₹{row.sellingPrice}</td>
                <td className="px-3 py-2">{row.quantity}</td>
                <td className="px-3 py-2">{row.reorderLevel}</td>
                <td className="px-3 py-2">{statusBadge(row.status)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(row)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStockAction({ sku: row.sku, mode: "add" })
                      }
                    >
                      + Stock
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No items match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ItemDetailPanel
          row={selected}
          onClose={() => setSelectedSku(null)}
          onEdit={() => openEdit(selected)}
          onAddStock={() => setStockAction({ sku: selected.sku, mode: "add" })}
          onAdjustStock={() =>
            setStockAction({ sku: selected.sku, mode: "adjust" })
          }
          onChanged={refresh}
        />
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="item-name">Name</Label>
                <Input id="item-name" {...register("name")} />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-sku">SKU</Label>
                <Input
                  id="item-sku"
                  disabled={Boolean(editing)}
                  {...register("sku")}
                />
                {errors.sku && (
                  <p className="text-xs text-destructive">{errors.sku.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-barcode">Barcode</Label>
                <Input id="item-barcode" {...register("barcode")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-category">Category</Label>
                <Input id="item-category" list="inv-categories" {...register("category")} />
                <datalist id="inv-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-unit">Unit size</Label>
                <Input id="item-unit" type="number" step="1" {...register("unitSize")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-cost">Cost price (₹)</Label>
                <Input id="item-cost" type="number" step="0.01" {...register("costPrice")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-sell">Selling price (₹)</Label>
                <Input id="item-sell" type="number" step="0.01" {...register("sellingPrice")} />
                {errors.sellingPrice && (
                  <p className="text-xs text-destructive">
                    {errors.sellingPrice.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-gst">GST %</Label>
                <Input id="item-gst" type="number" step="0.1" {...register("gstRate")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="item-reorder">Reorder level</Label>
                <Input
                  id="item-reorder"
                  type="number"
                  step="1"
                  {...register("reorderLevel")}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("active")} />
              Active (sellable on POS)
            </label>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <Separator />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {stockAction && (
        <StockActionDialogs
          sku={stockAction.sku}
          mode={stockAction.mode}
          onClose={() => setStockAction(null)}
          onDone={() => {
            setStockAction(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
