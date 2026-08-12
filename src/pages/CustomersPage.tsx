import { Link } from "react-router-dom"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Download, Megaphone, Trash2, UserPlus } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/money"
import {
  CustomerService,
  type CustomerRecord,
} from "@/modules/customer"
import { CrmError, CrmService, type CustomerSegmentId } from "@/modules/crm"
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

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CustomersPage() {
  const { userId, profile } = useAuth()
  const [items, setItems] = useState<CustomerRecord[]>(() =>
    CustomerService.list()
  )
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [query, setQuery] = useState("")
  const [segment, setSegment] = useState<CustomerSegmentId | "all">("all")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [campaignBody, setCampaignBody] = useState("")
  const [campaignMsg, setCampaignMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void CrmService.hydrateDeps().then(() => {
      if (!cancelled) refresh()
    })
    return () => {
      cancelled = true
    }
  }, [])

  function refresh() {
    setItems(CustomerService.list())
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (segment !== "all") {
        const segs = CrmService.deriveSegments(item)
        if (!segs.some((s) => s.id === segment)) return false
      }
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        (item.phone || "").includes(q) ||
        (item.email || "").toLowerCase().includes(q)
      )
    })
  }, [items, query, segment])

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

  function onExport() {
    const csv = CrmService.exportSegmentCsv(segment)
    const label = segment === "all" ? "all" : segment
    downloadCsv(`customers-${label}.csv`, csv)
  }

  async function onCampaign(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCampaignMsg(null)
    if (segment === "all") {
      setError("Pick a segment before sending a campaign.")
      return
    }
    setBusy(true)
    try {
      const result = await CrmService.queueSegmentCampaign({
        segmentId: segment,
        body: campaignBody,
        actorId: userId,
        storeId: profile?.storeId ?? null,
      })
      setCampaignBody("")
      setCampaignMsg(
        `Queued ${result.queued} message${result.queued === 1 ? "" : "s"}${
          result.skipped ? ` · skipped ${result.skipped} without phone` : ""
        }.`
      )
    } catch (err) {
      setError(
        err instanceof CrmError || err instanceof Error
          ? err.message
          : "Could not queue campaign."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          CRM directory — profile, purchases, store credit, loyalty, and
          segments. Open a customer for the full view.
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={segment}
            onChange={(e) =>
              setSegment(e.target.value as CustomerSegmentId | "all")
            }
          >
            <option value="all">All segments</option>
            <option value="vip">VIP</option>
            <option value="regular">Regular</option>
            <option value="new">New</option>
            <option value="at_risk">At risk</option>
            <option value="credit_holder">Store credit</option>
            <option value="loyalty_ready">Loyalty ready</option>
          </select>
          <Input
            className="sm:max-w-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or phone"
          />
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
        </div>
      </div>

      <form
        className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => void onCampaign(e)}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="crm-campaign" className="flex items-center gap-1.5">
            <Megaphone className="size-3.5" />
            Segment campaign
          </Label>
          <Input
            id="crm-campaign"
            value={campaignBody}
            onChange={(e) => setCampaignBody(e.target.value)}
            placeholder={
              segment === "all"
                ? "Select a segment first, then write a message"
                : `Message all “${segment}” customers with a phone`
            }
            disabled={segment === "all"}
          />
          {campaignMsg ? (
            <p className="text-xs text-muted-foreground">{campaignMsg}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Queues WhatsApp campaign notifications for the filtered segment.
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={busy || segment === "all" || !campaignBody.trim()}
        >
          Queue campaign
        </Button>
      </form>

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
              title={
                <Link
                  to={`/customers/${customer.id}`}
                  className="hover:underline"
                >
                  {customer.name}
                </Link>
              }
              meta={
                <>
                  <div>
                    {customer.phone || "—"}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </div>
                  <div>
                    {customer.visitCount} visits ·{" "}
                    {formatMoney(customer.totalSpendPaisa)} ·{" "}
                    {customer.loyaltyPoints} pts · credit{" "}
                    {formatMoney(customer.storeCreditPaisa)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {CrmService.deriveSegments(customer)
                      .map((s) => s.label)
                      .join(" · ") || "—"}
                  </div>
                </>
              }
              actions={
                <div className="flex gap-2">
                  <Link
                    to={`/customers/${customer.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Open
                  </Link>
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
                </div>
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
                    <th className="px-3 py-2 font-medium">Points</th>
                    <th className="px-3 py-2 font-medium">Credit</th>
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
                        <Link
                          to={`/customers/${customer.id}`}
                          className="font-medium hover:underline"
                        >
                          {customer.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {CrmService.deriveSegments(customer)
                            .map((s) => s.label)
                            .join(" · ") || "—"}
                        </div>
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
                      <td className="px-3 py-2 tabular-nums">
                        {customer.loyaltyPoints}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatMoney(customer.storeCreditPaisa)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/customers/${customer.id}`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                            })}
                          >
                            Open
                          </Link>
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
                        </div>
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
