import { useMemo, useState, type FormEvent } from "react"
import { Trash2, UserPlus } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/money"
import {
  CustomerService,
  type CustomerRecord,
} from "@/modules/customer"
import { useAuth } from "@/providers/AuthProvider"

type FormState = {
  name: string
  phone: string
  email: string
  notes: string
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  notes: "",
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export function CustomersPage() {
  const { userId, profile } = useAuth()
  const [items, setItems] = useState<CustomerRecord[]>(() =>
    CustomerService.list()
  )
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function refresh() {
    setItems(CustomerService.list())
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.phone || "").includes(q) ||
        (item.email || "").toLowerCase().includes(q)
    )
  }, [items, query])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError("Customer name is required.")
      return
    }

    setBusy(true)
    try {
      await CustomerService.create(
        {
          name: form.name,
          phone: form.phone || undefined,
          email: form.email || undefined,
          notes: form.notes || undefined,
          storeId: profile?.storeId ?? null,
        },
        userId
      )
      setForm(EMPTY_FORM)
      refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save customer."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      await CustomerService.delete(id)
      refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete customer."
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Store customer directory — synced to Firestore and Sheets when
          configured.
        </p>
      </div>

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5 sm:col-span-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="size-4" />
            Add customer
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cust-name">Name</Label>
          <Input
            id="cust-name"
            value={form.name}
            onChange={(event) =>
              setForm((f) => ({ ...f, name: event.target.value }))
            }
            placeholder="Customer name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cust-phone">Mobile</Label>
          <Input
            id="cust-phone"
            inputMode="tel"
            value={form.phone}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                phone: event.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16),
              }))
            }
            placeholder="10-digit mobile"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cust-email">Email (optional)</Label>
          <Input
            id="cust-email"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((f) => ({ ...f, email: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cust-notes">Notes (optional)</Label>
          <Input
            id="cust-notes"
            value={form.notes}
            onChange={(event) =>
              setForm((f) => ({ ...f, notes: event.target.value }))
            }
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive sm:col-span-2">{error}</p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save customer"}
          </Button>
        </div>
      </form>

      <Separator />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} customer{filtered.length === 1 ? "" : "s"}
        </p>
        <Input
          className="sm:max-w-xs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or phone"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No customers yet. Add one above, or capture name/phone when marking a
          sale paid.
        </p>
      ) : (
        <ResponsiveList
          cards={filtered.map((customer) => (
            <MobileListCard
              key={customer.id}
              title={customer.name}
              meta={
                <>
                  <div>
                    {customer.phone || "—"}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </div>
                  <div>
                    {customer.visitCount} visits ·{" "}
                    {formatMoney(customer.totalSpendPaisa)} · Last{" "}
                    {formatWhen(customer.lastPurchaseAt)}
                  </div>
                </>
              }
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  disabled={deletingId === customer.id}
                  onClick={() => void onDelete(customer.id)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
          ))}
          table={
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Visits</th>
                    <th className="px-3 py-2 font-medium">Spend</th>
                    <th className="px-3 py-2 font-medium">Last purchase</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{customer.name}</div>
                        {customer.email ? (
                          <div className="text-xs text-muted-foreground">
                            {customer.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {customer.phone || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {customer.visitCount}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(customer.totalSpendPaisa)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatWhen(customer.lastPurchaseAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === customer.id}
                          onClick={() => void onDelete(customer.id)}
                        >
                          <Trash2 data-icon="inline-start" />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      )}
    </div>
  )
}
