import { useMemo, useState, type FormEvent } from "react"
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
import {
  SupplierError,
  SupplierService,
  type SupplierRecord,
} from "@/modules/supplier"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

type FormState = {
  name: string
  phone: string
  email: string
  gstin: string
  address: string
  city: string
  state: string
  pin: string
  paymentTerms: string
  notes: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  pin: "",
  paymentTerms: "",
  notes: "",
  active: true,
}

function fromRecord(s: SupplierRecord): FormState {
  return {
    name: s.name,
    phone: s.phone || "",
    email: s.email || "",
    gstin: s.gstin || "",
    address: s.address || "",
    city: s.city || "",
    state: s.state || "",
    pin: s.pin || "",
    paymentTerms: s.paymentTerms || "",
    notes: s.notes || "",
    active: s.active,
  }
}

/**
 * Supplier master directory — Purchasing Phase 1.
 */
export function SuppliersView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [query, setQuery] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRecord | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const items = useMemo(() => {
    void tick
    return SupplierService.list({ includeInactive: showInactive })
  }, [tick, showInactive])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone || "").includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.gstin || "").toLowerCase().includes(q)
    )
  }, [items, query])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setEditorOpen(true)
  }

  function openEdit(record: SupplierRecord) {
    setEditing(record)
    setForm(fromRecord(record))
    setError(null)
    setEditorOpen(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError("Supplier name is required.")
      return
    }

    setBusy(true)
    try {
      if (editing) {
        await SupplierService.update({
          id: editing.id,
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          gstin: form.gstin || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          pin: form.pin || null,
          paymentTerms: form.paymentTerms || null,
          notes: form.notes || null,
          active: form.active,
          actorId: userId,
        })
      } else {
        await SupplierService.create(
          {
            name: form.name,
            phone: form.phone || undefined,
            email: form.email || undefined,
            gstin: form.gstin || undefined,
            address: form.address || undefined,
            city: form.city || undefined,
            state: form.state || undefined,
            pin: form.pin || undefined,
            paymentTerms: form.paymentTerms || undefined,
            notes: form.notes || undefined,
            active: form.active,
            storeId: profile?.storeId ?? null,
          },
          userId
        )
      }
      setEditorOpen(false)
      refresh()
    } catch (err) {
      setError(
        err instanceof SupplierError || err instanceof Error
          ? err.message
          : "Could not save supplier."
      )
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(record: SupplierRecord) {
    setError(null)
    try {
      await SupplierService.setActive(record.id, !record.active, userId)
      refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update supplier."
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
            placeholder="Search name, phone, GSTIN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            Add supplier
          </Button>
        </div>
      </div>

      {error && !editorOpen ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">GSTIN</th>
              <th className="px-3 py-2">Terms</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  {s.email ? (
                    <div className="text-xs text-muted-foreground">{s.email}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 tabular-nums">{s.phone || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.gstin || "—"}</td>
                <td className="px-3 py-2">{s.paymentTerms || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      s.active
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleActive(s)}
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No suppliers yet. Add a supplier to start purchasing.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit supplier" : "Add supplier"}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
            <Field label="Name" className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Supplier legal / trade name"
                required
              />
            </Field>
            <Field label="Phone">
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    phone: e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16),
                  }))
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="GSTIN">
              <Input
                value={form.gstin}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    gstin: e.target.value.toUpperCase().slice(0, 15),
                  }))
                }
                placeholder="15-char GSTIN"
              />
            </Field>
            <Field label="Payment terms">
              <Input
                value={form.paymentTerms}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                }
                placeholder="e.g. Net 30"
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              />
            </Field>
            <Field label="PIN">
              <Input
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
              />
              Active
            </label>
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2">{error}</p>
            ) : null}
            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Save supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
