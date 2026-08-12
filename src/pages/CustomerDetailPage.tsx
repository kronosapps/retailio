import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { CrmError, CrmService } from "@/modules/crm"
import { useAuth } from "@/providers/AuthProvider"

function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

/**
 * Customer CRM profile — lifetime KPIs, history, credit, loyalty, offers, comms.
 */
export function CustomerDetailPage() {
  const { customerId = "" } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const profile = useMemo(() => {
    void tick
    return customerId ? CrmService.getProfile(customerId) : null
  }, [customerId, tick])

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [gstin, setGstin] = useState("")
  const [tags, setTags] = useState("")
  const [offerNote, setOfferNote] = useState("")
  const [outstandingRupees, setOutstandingRupees] = useState("")
  const [points, setPoints] = useState("")
  const [punches, setPunches] = useState("")

  useEffect(() => {
    if (!profile) return
    const c = profile.customer
    setName(c.name)
    setPhone(c.phone || "")
    setEmail(c.email || "")
    setNotes(c.notes || "")
    setGstin(c.gstin || "")
    setTags(c.tags.join(", "))
    setOfferNote(c.offerNote || "")
    setOutstandingRupees(String(c.outstandingPaisa / 100))
    setPoints(String(c.loyaltyPoints))
    setPunches(String(c.loyaltyPunches))
  }, [profile])

  if (!customerId) {
    return <p className="text-sm text-destructive">Missing customer id.</p>
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 pb-8">
        <p className="text-sm text-destructive">Customer not found.</p>
        <Link
          to="/customers"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to customers
        </Link>
      </div>
    )
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await CrmService.updateProfile({
        id: customerId,
        name,
        phone,
        email,
        notes,
        gstin,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        offerNote,
        actorId: userId,
      })
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.")
    } finally {
      setBusy(false)
    }
  }

  async function saveOutstanding(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const rupees = Number(outstandingRupees)
      if (!Number.isFinite(rupees) || rupees < 0) {
        throw new CrmError("VALIDATION", "Outstanding must be ≥ 0.")
      }
      await CrmService.adjustOutstanding({
        customerId,
        outstandingPaisa: Math.round(rupees * 100),
        actorId: userId,
      })
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update AR.")
    } finally {
      setBusy(false)
    }
  }

  async function saveLoyalty(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await CrmService.adjustLoyaltyPoints({
        customerId,
        loyaltyPoints: Number(points),
        actorId: userId,
      })
      await CrmService.adjustLoyaltyPunches({
        customerId,
        loyaltyPunches: Number(punches),
        actorId: userId,
      })
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update loyalty.")
    } finally {
      setBusy(false)
    }
  }

  const c = profile.customer

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/customers")}
          >
            <ArrowLeft className="size-4" />
            Customers
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {c.phone || "No phone"}
            {c.email ? ` · ${c.email}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.segments.map((s) => (
              <span
                key={s.id}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium"
              >
                {s.label}
              </span>
            ))}
            {c.tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted px-2 py-0.5 text-[11px]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Lifetime purchases"
          value={formatMoney(profile.lifetimeSpendPaisa)}
        />
        <Kpi label="Visits" value={String(profile.visitCount)} />
        <Kpi
          label="Outstanding"
          value={formatMoney(profile.outstandingPaisa)}
          hint={
            profile.unpaidInvoicesPaisa > 0
              ? `incl. ${formatMoney(profile.unpaidInvoicesPaisa)} unpaid invoices`
              : "charge account + unpaid"
          }
        />
        <Kpi
          label="Loyalty points"
          value={String(profile.loyaltyPoints)}
          hint={`${profile.loyaltyPunches}/${profile.punchesRequired} punches · credit ${formatMoney(profile.storeCreditPaisa)}`}
        />
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="history">Purchases</TabsTrigger>
          <TabsTrigger value="credit">Credit</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="comms">Comms</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <form
            className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
            onSubmit={(e) => void saveProfile(e)}
          >
            <div className="space-y-1.5">
              <Label htmlFor="crm-name">Name</Label>
              <Input
                id="crm-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-phone">Mobile</Label>
              <Input
                id="crm-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-email">Email</Label>
              <Input
                id="crm-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-gstin">GSTIN</Label>
              <Input
                id="crm-gstin"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crm-tags">Tags (comma-separated)</Label>
              <Input
                id="crm-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="wholesale, festival"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crm-notes">Notes</Label>
              <Input
                id="crm-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crm-offer">Personal offer note</Label>
              <Input
                id="crm-offer"
                value={offerNote}
                onChange={(e) => setOfferNote(e.target.value)}
                placeholder="e.g. Birthday 15% this week"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Save profile
              </Button>
            </div>
          </form>

          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
            onSubmit={(e) => void saveOutstanding(e)}
          >
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor="crm-ar">Charge-account outstanding (₹)</Label>
              <Input
                id="crm-ar"
                type="number"
                min={0}
                step="any"
                value={outstandingRupees}
                onChange={(e) => setOutstandingRupees(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Unpaid POS invoices are added on top automatically.
              </p>
            </div>
            <Button type="submit" variant="outline" disabled={busy}>
              Update AR
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-2">
          {profile.purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {profile.purchases.map((row) => (
                <li
                  key={row.invoiceId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <Link
                      to={`/invoices/${row.invoiceId}`}
                      className="font-medium hover:underline"
                    >
                      {row.invoiceId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(row.createdAt)} · {row.itemCount} items ·{" "}
                      {row.paymentStatus || "—"}
                    </p>
                  </div>
                  <span className="tabular-nums font-medium">
                    {formatMoney(row.totalPaisa)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="credit" className="mt-4 space-y-3">
          <p className="text-sm">
            Store credit balance:{" "}
            <span className="font-semibold tabular-nums">
              {formatMoney(profile.storeCreditPaisa)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Issued from sales returns (credit note settlement). Apply at POS
            payment checkout.
          </p>
          <Separator />
          {profile.creditNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit notes.</p>
          ) : (
            <ul className="space-y-2">
              {profile.creditNotes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{n.creditNoteNumber}</span>
                    <span
                      className={cn(
                        "text-xs",
                        n.status === "OPEN"
                          ? "text-muted-foreground"
                          : "text-destructive"
                      )}
                    >
                      {n.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(n.amountPaisa)} · remaining{" "}
                    {formatMoney(n.balancePaisa)} · {formatWhen(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="loyalty" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Punches stamp on each paid visit; redeeming punch reward on POS resets
            to 0. Points earn 1 per ₹1 spent.
          </p>
          <form
            className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
            onSubmit={(e) => void saveLoyalty(e)}
          >
            <div className="space-y-1.5">
              <Label htmlFor="crm-punches">
                Punches (max {profile.punchesRequired})
              </Label>
              <Input
                id="crm-punches"
                type="number"
                min={0}
                max={profile.punchesRequired}
                value={punches}
                onChange={(e) => setPunches(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-points">Points</Label>
              <Input
                id="crm-points"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Update loyalty
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="offers" className="mt-4 space-y-3">
          {profile.offerNote ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              Personal: {profile.offerNote}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No personal offer note. Add one on the Profile tab.
            </p>
          )}
          <p className="text-xs font-medium text-muted-foreground">
            Active store coupons
          </p>
          {profile.openOffers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active coupons. Manage at Utilities → Pricing.
            </p>
          ) : (
            <ul className="space-y-2">
              {profile.openOffers.map((o) => (
                <li
                  key={o.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{o.code}</span> · {o.name}
                  <p className="text-xs text-muted-foreground">
                    {o.startsOn} → {o.endsOn}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="comms" className="mt-4 space-y-2">
          {profile.communications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notification history for this customer yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {profile.communications.map((row) => (
                <li
                  key={row.notificationId}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {row.messageType} · {row.channel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(row.createdAt)} · {row.invoiceId}
                    {row.error ? ` · ${row.error}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
