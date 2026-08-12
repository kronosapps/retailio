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
  const [hydrating, setHydrating] = useState(true)

  useEffect(() => {
    let cancelled = false
    void CrmService.hydrateDeps().finally(() => {
      if (!cancelled) {
        setHydrating(false)
        setTick((t) => t + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [customerId])

  const profile = useMemo(() => {
    void tick
    return customerId ? CrmService.getProfile(customerId) : null
  }, [customerId, tick])

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [gstin, setGstin] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pin, setPin] = useState("")
  const [birthday, setBirthday] = useState("")
  const [preferences, setPreferences] = useState("")
  const [tags, setTags] = useState("")
  const [offerNote, setOfferNote] = useState("")
  const [outstandingRupees, setOutstandingRupees] = useState("")
  const [settleRupees, setSettleRupees] = useState("")
  const [settleMethod, setSettleMethod] = useState<"Cash" | "UPI">("Cash")
  const [points, setPoints] = useState("")
  const [punches, setPunches] = useState("")
  const [commType, setCommType] = useState<"offer" | "reminder">("offer")
  const [commBody, setCommBody] = useState("")
  const [adjustNoteId, setAdjustNoteId] = useState<string | null>(null)
  const [adjustBalanceRupees, setAdjustBalanceRupees] = useState("")

  useEffect(() => {
    if (!profile) return
    const c = profile.customer
    setName(c.name)
    setPhone(c.phone || "")
    setEmail(c.email || "")
    setNotes(c.notes || "")
    setGstin(c.gstin || "")
    setAddress(c.address || "")
    setCity(c.city || "")
    setState(c.state || "")
    setPin(c.pin || "")
    setBirthday(c.birthday || "")
    setPreferences(c.preferences || "")
    setTags(c.tags.join(", "))
    setOfferNote(c.offerNote || "")
    setOutstandingRupees(String(c.outstandingPaisa / 100))
    setPoints(String(c.loyaltyPoints))
    setPunches(String(c.loyaltyPunches))
  }, [profile])

  if (!customerId) {
    return <p className="text-sm text-destructive">Missing customer id.</p>
  }

  if (hydrating && !profile) {
    return (
      <p className="text-sm text-muted-foreground">Loading customer…</p>
    )
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
        address,
        city,
        state,
        pin,
        birthday: birthday || null,
        preferences: preferences || null,
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

  async function settleAr(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const rupees = Number(settleRupees)
      if (!Number.isFinite(rupees) || rupees <= 0) {
        throw new CrmError("VALIDATION", "Enter a positive settlement amount.")
      }
      await CrmService.settleOutstanding({
        customerId,
        amountPaisa: Math.round(rupees * 100),
        method: settleMethod,
        actorId: userId,
      })
      setSettleRupees("")
      setTick((t) => t + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not settle outstanding."
      )
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

  async function sendComm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await CrmService.queueCustomerMessage({
        customerId,
        messageType: commType,
        body: commBody,
        actorId: userId,
      })
      setCommBody("")
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue message.")
    } finally {
      setBusy(false)
    }
  }

  async function voidNote(creditNoteId: string) {
    setError(null)
    setBusy(true)
    try {
      await CrmService.voidCreditNote({
        creditNoteId,
        actorId: userId,
      })
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not void note.")
    } finally {
      setBusy(false)
    }
  }

  async function saveNoteAdjust(e: FormEvent) {
    e.preventDefault()
    if (!adjustNoteId) return
    setError(null)
    setBusy(true)
    try {
      const rupees = Number(adjustBalanceRupees)
      if (!Number.isFinite(rupees) || rupees < 0) {
        throw new CrmError("VALIDATION", "Balance must be ≥ 0.")
      }
      await CrmService.adjustCreditNote({
        creditNoteId: adjustNoteId,
        balancePaisa: Math.round(rupees * 100),
        actorId: userId,
      })
      setAdjustNoteId(null)
      setAdjustBalanceRupees("")
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not adjust note.")
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
            {c.city ? ` · ${c.city}` : ""}
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
          <TabsTrigger value="audit">Audit</TabsTrigger>
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
              <Label htmlFor="crm-address">Address</Label>
              <Input
                id="crm-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street / shop"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-city">City</Label>
              <Input
                id="crm-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-state">State</Label>
              <Input
                id="crm-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-pin">PIN</Label>
              <Input
                id="crm-pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-birthday">Birthday</Label>
              <Input
                id="crm-birthday"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="crm-prefs">Preferences</Label>
              <Input
                id="crm-prefs"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="e.g. WhatsApp OK, veg only, evening delivery"
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

          {c.outstandingPaisa > 0 ? (
            <form
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
              onSubmit={(e) => void settleAr(e)}
            >
              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <Label htmlFor="crm-settle">Settle AR (₹)</Label>
                <Input
                  id="crm-settle"
                  type="number"
                  min={0}
                  step="any"
                  value={settleRupees}
                  onChange={(e) => setSettleRupees(e.target.value)}
                  placeholder={`Max ${c.outstandingPaisa / 100}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-settle-method">Method</Label>
                <select
                  id="crm-settle-method"
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={settleMethod}
                  onChange={(e) =>
                    setSettleMethod(e.target.value as "Cash" | "UPI")
                  }
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
              <Button type="submit" disabled={busy}>
                Collect settlement
              </Button>
            </form>
          ) : null}
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
            Issued from sales returns. Apply at POS payment. Void / adjust
            remaining balance here; apply remains POS-only.
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
                          : n.status === "VOID"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      )}
                    >
                      {n.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(n.amountPaisa)} · remaining{" "}
                    {formatMoney(n.balancePaisa)} · {formatWhen(n.createdAt)}
                  </p>
                  {n.status === "OPEN" && n.balancePaisa > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setAdjustNoteId(n.id)
                          setAdjustBalanceRupees(String(n.balancePaisa / 100))
                        }}
                      >
                        Adjust
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void voidNote(n.id)}
                      >
                        Void
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {adjustNoteId ? (
            <form
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
              onSubmit={(e) => void saveNoteAdjust(e)}
            >
              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <Label htmlFor="crm-cn-adj">Remaining balance (₹)</Label>
                <Input
                  id="crm-cn-adj"
                  type="number"
                  min={0}
                  step="any"
                  value={adjustBalanceRupees}
                  onChange={(e) => setAdjustBalanceRupees(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                Save balance
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAdjustNoteId(null)
                  setAdjustBalanceRupees("")
                }}
              >
                Cancel
              </Button>
            </form>
          ) : null}
        </TabsContent>

        <TabsContent value="loyalty" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Digital punches mirror the physical punch card. Redeeming a punch
            reward on POS resets to 0. Points earn per spend (see Promotions
            Management).
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

          <div className="flex flex-wrap gap-2 rounded-xl border border-border p-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setError(null)
                  setBusy(true)
                  try {
                    await CrmService.stampPhysicalCard({
                      customerId,
                      actorId: userId,
                    })
                    setTick((t) => t + 1)
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not stamp card."
                    )
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              Stamp physical card (+1)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setError(null)
                  setBusy(true)
                  try {
                    await CrmService.losePhysicalCardPunch({
                      customerId,
                      actorId: userId,
                    })
                    setTick((t) => t + 1)
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not adjust punches."
                    )
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              Lost physical card (−1)
            </Button>
          </div>
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

        <TabsContent value="comms" className="mt-4 space-y-4">
          <form
            className="space-y-3 rounded-xl border border-border p-4"
            onSubmit={(e) => void sendComm(e)}
          >
            <p className="text-sm font-medium">Send offer or reminder</p>
            <p className="text-xs text-muted-foreground">
              Queues WhatsApp for delivery (Cloud Functions). Needs a mobile on
              the profile.
            </p>
            <div className="flex flex-wrap gap-3">
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={commType}
                onChange={(e) =>
                  setCommType(e.target.value as "offer" | "reminder")
                }
              >
                <option value="offer">Offer</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <Input
              value={commBody}
              onChange={(e) => setCommBody(e.target.value)}
              placeholder={
                commType === "offer"
                  ? "e.g. 10% off this weekend — show this message"
                  : "e.g. Reminder: open balance due this week"
              }
            />
            <Button type="submit" disabled={busy || !commBody.trim()}>
              Queue message
            </Button>
          </form>

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

        <TabsContent value="audit" className="mt-4 space-y-2">
          {profile.audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No punch, point, credit, or AR adjustments recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {profile.audit.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{row.kind}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatWhen(row.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{row.message}</p>
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
