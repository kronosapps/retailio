import { useMemo, useRef, useState, type FormEvent } from "react"
import { Download, Pencil, Plus, Search, Upload } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
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
  SupplierImportService,
  SupplierService,
  type SupplierImportPreview,
  type SupplierImportResult,
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
  const importFileRef = useRef<HTMLInputElement>(null)
  const [tick, setTick] = useState(0)
  const [query, setQuery] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRecord | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [importPreview, setImportPreview] =
    useState<SupplierImportPreview | null>(null)
  const [importResult, setImportResult] =
    useState<SupplierImportResult | null>(null)
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

  function openImport() {
    setImportPreview(null)
    setImportResult(null)
    setError(null)
    if (importFileRef.current) importFileRef.current.value = ""
    setImportOpen(true)
  }

  async function onImportFile(file: File | null) {
    setError(null)
    setImportResult(null)
    setImportPreview(null)
    if (!file) return
    setBusy(true)
    try {
      const preview = await SupplierImportService.parseAndValidate(file)
      setImportPreview(preview)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not parse the Excel file."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onImportPush() {
    if (!importPreview) return
    setBusy(true)
    setError(null)
    try {
      const result = await SupplierImportService.push(importPreview, {
        storeId: profile?.storeId ?? null,
        actorId: userId,
      })
      setImportResult(result)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.")
    } finally {
      setBusy(false)
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
          <Button type="button" variant="outline" onClick={openImport}>
            <Upload className="size-4" />
            Import
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            Add supplier
          </Button>
        </div>
      </div>

      {error && !editorOpen && !importOpen ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <ResponsiveList
        cards={
          filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              No suppliers yet. Add a supplier to start purchasing.
            </p>
          ) : (
            filtered.map((s) => (
              <MobileListCard
                key={s.id}
                title={s.name}
                meta={
                  <>
                    <div>
                      {s.phone || "—"}
                      {s.email ? ` · ${s.email}` : ""}
                    </div>
                    <div>
                      {s.gstin || "—"}
                      {s.paymentTerms ? ` · ${s.paymentTerms}` : ""}
                    </div>
                  </>
                }
                badge={
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
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={() => void toggleActive(s)}
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </Button>
                  </>
                }
              />
            ))
          )
        }
        table={
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
                        <div className="text-xs text-muted-foreground">
                          {s.email}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s.phone || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.gstin || "—"}
                    </td>
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
        }
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl">
          <DialogHeader>
            <DialogTitle>Import suppliers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void SupplierImportService.downloadTemplate()}
              >
                <Download className="size-4" />
                Download template
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="max-w-xs text-sm file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5"
                onChange={(e) =>
                  void onImportFile(e.target.files?.[0] ?? null)
                }
              />
            </div>

            {importPreview ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {importPreview.totalRows} rows · {importPreview.newRows} new ·{" "}
                  {importPreview.duplicateRows} duplicate ·{" "}
                  {importPreview.invalidRows} invalid
                </p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="sticky top-0 border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5">Row</th>
                        <th className="px-2 py-1.5">Name</th>
                        <th className="px-2 py-1.5">Phone</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row) => (
                        <tr key={row.rowNumber} className="border-b last:border-0">
                          <td className="px-2 py-1.5 tabular-nums">
                            {row.rowNumber}
                          </td>
                          <td className="px-2 py-1.5">{row.name || "—"}</td>
                          <td className="px-2 py-1.5">{row.phone || "—"}</td>
                          <td className="px-2 py-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-xs font-medium",
                                row.status === "NEW"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : row.status === "DUPLICATE"
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-destructive/15 text-destructive"
                              )}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {row.messages.join(" ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {importResult ? (
              <p className="text-sm">
                Imported {importResult.imported}, skipped {importResult.skipped}
                , failed {importResult.failed}.
                {importResult.errors.length > 0
                  ? ` ${importResult.errors
                      .map((e) => `Row ${e.rowNumber}: ${e.message}`)
                      .join("; ")}`
                  : ""}
              </p>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              disabled={
                busy ||
                !importPreview ||
                importPreview.newRows === 0 ||
                Boolean(importResult)
              }
              onClick={() => void onImportPush()}
            >
              {busy ? "Importing…" : "Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto rounded-none p-4 sm:max-w-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl">
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
