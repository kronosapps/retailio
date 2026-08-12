import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getEffectiveLoyalty,
  getRedeemableLoyaltyPoints,
} from "@/data/loyalty"
import { getPromoSettings } from "@/data/promoSettings"
import { normalizeCustomerPhone } from "@/data/customers"
import { CustomerService, type CustomerRecord } from "@/modules/customer"
import { CrmError, CrmService } from "@/modules/crm/CrmService"

type Mode = "search" | "onboard"

/**
 * POS attach: search by phone/name, or onboard a new phone (name, email, DOB)
 * with welcome promo points. Skip → punch-card fallback for walk-ins.
 */
export function CustomerAttachField({
  storeId,
  actorId = null,
  onPick,
  onSkipPunchFallback,
  placeholder = "Mobile number or name",
}: {
  storeId: string | null
  actorId?: string | null
  onPick: (c: CustomerRecord) => void
  /** Guest declined registration — use physical punch card. */
  onSkipPunchFallback?: () => void
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<Mode>("search")
  const [phoneDraft, setPhoneDraft] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [birthday, setBirthday] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loyalty = getEffectiveLoyalty()
  const welcome = getPromoSettings().welcomePromo

  const hits = useMemo(() => {
    if (query.trim().length < 1) return []
    return CustomerService.search(query, storeId, 6)
  }, [query, storeId])

  const normalizedQueryPhone = normalizeCustomerPhone(query)

  function startOnboard(phone: string) {
    const digits = normalizeCustomerPhone(phone)
    if (!digits || digits.length < 10) {
      setError("Enter a 10-digit mobile number to register.")
      return
    }
    const existing = CustomerService.findByPhone(digits, storeId)
    if (existing) {
      onPick(existing)
      setQuery("")
      setError(null)
      return
    }
    setPhoneDraft(digits)
    setMode("onboard")
    setError(null)
    setName("")
    setEmail("")
    setBirthday("")
  }

  async function submitOnboard() {
    setBusy(true)
    setError(null)
    try {
      const customer = await CrmService.onboardAtPos({
        phone: phoneDraft,
        name,
        email,
        birthday,
        storeId,
        actorId,
      })
      onPick(customer)
      setMode("search")
      setQuery("")
      setPhoneDraft("")
    } catch (e) {
      setError(
        e instanceof CrmError ? e.message : "Could not register customer."
      )
    } finally {
      setBusy(false)
    }
  }

  if (mode === "onboard") {
    return (
      <div className="space-y-3 rounded-md border border-border px-3 py-3">
        <div>
          <p className="text-sm font-medium">New customer</p>
          <p className="text-xs text-muted-foreground">
            Mobile {phoneDraft}
            {welcome.enabled
              ? ` · Welcome ${welcome.grantPoints} pts (${welcome.redeemPerVisit} now + ${welcome.redeemPerVisit} next visit)`
              : ""}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-onboard-name" className="text-xs">
            Name
          </Label>
          <Input
            id="pos-onboard-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-onboard-email" className="text-xs">
            Email
          </Label>
          <Input
            id="pos-onboard-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-onboard-dob" className="text-xs">
            Date of birth
          </Label>
          <Input
            id="pos-onboard-dob"
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            disabled={busy}
          />
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void submitOnboard()}
          >
            {busy ? "Saving…" : "Register & attach"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setMode("search")
              setError(null)
            }}
          >
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode("search")
              setQuery("")
              onSkipPunchFallback?.()
            }}
          >
            Skip — punch card
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setError(null)
        }}
        placeholder={placeholder}
        inputMode="tel"
      />
      {hits.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
          {hits.map((c) => {
            const redeemable = getRedeemableLoyaltyPoints(c)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onPick(c)
                    setQuery("")
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.phone || "—"} · {c.loyaltyPunches}/
                    {loyalty.punchesRequired} punches · {c.loyaltyPoints} pts
                    {redeemable !== c.loyaltyPoints
                      ? ` (${redeemable} redeemable now)`
                      : ""}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {normalizedQueryPhone &&
      normalizedQueryPhone.length >= 10 &&
      hits.length === 0 ? (
        <div className="space-y-2 rounded-md border border-dashed border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            New number — register for welcome points, or continue with punch
            card.
          </p>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => startOnboard(query)}
            >
              Register customer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("")
                onSkipPunchFallback?.()
              }}
            >
              Skip — punch card
            </Button>
          </div>
        </div>
      ) : null}

      {!normalizedQueryPhone && query.trim().length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Ask for mobile to attach CRM / welcome points. Without registration,
          use the physical punch card (Halwa 500g+ by default).
        </p>
      ) : null}
    </div>
  )
}
