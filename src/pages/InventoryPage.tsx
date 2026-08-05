import { useEffect, useState, type FormEvent } from "react"
import { PackagePlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  InventoryService,
  type InventoryRecord,
} from "@/modules/inventory"
import { useAuth } from "@/providers/AuthProvider"

type FormState = {
  name: string
  sku: string
  quantity: string
  unit: string
  category: string
  notes: string
}

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  quantity: "",
  unit: "kg",
  category: "Ingredients",
  notes: "",
}

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

export function InventoryPage() {
  const { userId, profile } = useAuth()
  const [items, setItems] = useState<InventoryRecord[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function refresh() {
    setItems(InventoryService.list())
  }

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await InventoryService.ensureSamples(
          profile?.storeId ?? null,
          userId
        )
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[RetailOS] Inventory sample seed failed", err)
        }
      }
      if (!cancelled) refresh()
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [profile?.storeId, userId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const name = form.name.trim()
    const quantity = Number(form.quantity)

    if (!name) {
      setError("Name is required.")
      return
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError("Quantity must be zero or a positive number.")
      return
    }

    setBusy(true)
    try {
      await InventoryService.create(
        {
          name,
          sku: form.sku,
          quantity,
          unit: form.unit,
          category: form.category,
          notes: form.notes,
          storeId: profile?.storeId ?? null,
        },
        userId
      )
      setForm(EMPTY_FORM)
      refresh()
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
      refresh()
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
          Add stock when it arrives, remove items you no longer track. Changes
          save locally, to Firestore when configured, and sync to the Inventory
          Google Sheet.
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
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Almonds"
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-sku">SKU</Label>
            <Input
              id="inv-sku"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              placeholder="Optional"
              autoComplete="off"
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

          <div className="space-y-1.5">
            <Label htmlFor="inv-unit">Unit</Label>
            <Input
              id="inv-unit"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="kg, L, pcs…"
              list="inv-unit-suggestions"
            />
            <datalist id="inv-unit-suggestions">
              <option value="kg" />
              <option value="L" />
              <option value="pcs" />
              <option value="pack" />
              <option value="box" />
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-category">Category</Label>
            <Input
              id="inv-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="Ingredients, Packaging…"
              list="inv-category-suggestions"
            />
            <datalist id="inv-category-suggestions">
              <option value="Ingredients" />
              <option value="Packaging" />
              <option value="Finished goods" />
              <option value="Consumables" />
            </datalist>
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
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add to inventory"}
            </Button>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Writes to database and queues a Google Sheets sync.
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
