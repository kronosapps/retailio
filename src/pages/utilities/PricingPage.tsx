import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMoney } from "@/lib/money"
import { LOYALTY_REWARD_ITEMS } from "@/data/loyalty-rewards"
import {
  formatRedeemMappingLabel,
  getEffectiveLoyalty,
} from "@/data/loyalty"
import {
  getPromoSettings,
  savePromoSettings,
  type PromoSettings,
} from "@/data/promoSettings"
import { BankingService } from "@/modules/banking/BankingService"
import {
  PricingError,
  PricingService,
  type CouponRecord,
  type PriceHistoryRecord,
  type PromotionRecord,
} from "@/modules/pricing"
import { useAuth } from "@/providers/AuthProvider"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { cn } from "@/lib/utils"

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Utilities → Promotions Management — discounts, loyalty, campaigns, mapping.
 */
export function PricingPage() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState("masters")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adminPasscode, setAdminPasscode] = useState("")
  const [settings, setSettings] = useState<PromoSettings>(() =>
    getPromoSettings()
  )

  const [promoName, setPromoName] = useState("")
  const [promoType, setPromoType] = useState<"PERCENT" | "FIXED">("PERCENT")
  const [promoValue, setPromoValue] = useState("10")
  const [promoStarts, setPromoStarts] = useState(todayKey())
  const [promoEnds, setPromoEnds] = useState(plusDays(30))
  const [promoSkus, setPromoSkus] = useState("")
  const [promoCategories, setPromoCategories] = useState("")

  const [couponCode, setCouponCode] = useState("")
  const [couponType, setCouponType] = useState<"PERCENT" | "FIXED">("PERCENT")
  const [couponValue, setCouponValue] = useState("10")
  const [couponStarts, setCouponStarts] = useState(todayKey())
  const [couponEnds, setCouponEnds] = useState(plusDays(30))
  const [couponMin, setCouponMin] = useState("0")
  const [couponSegments, setCouponSegments] = useState("")

  const [historySku, setHistorySku] = useState("")
  const [explainInvoiceId, setExplainInvoiceId] = useState("")
  const [explainLines, setExplainLines] = useState<
    { name: string; explanation: string }[] | null
  >(null)

  useEffect(() => {
    void PricingService.hydrate().then(() => setTick((t) => t + 1))
    setSettings(getPromoSettings())
  }, [])

  function requireAdminPasscode(): boolean {
    if (!BankingService.verifyPasscode(adminPasscode)) {
      setError("Admin passcode required to change promotion switches.")
      return false
    }
    setError(null)
    return true
  }

  function refreshSettings() {
    setSettings(getPromoSettings())
    setTick((t) => t + 1)
  }

  const promotions = useMemo(() => {
    void tick
    return PricingService.listPromotions()
  }, [tick])

  const coupons = useMemo(() => {
    void tick
    return PricingService.listCoupons()
  }, [tick])

  const history = useMemo(() => {
    void tick
    return PricingService.listPriceHistory(historySku || undefined)
  }, [tick, historySku])

  async function savePromo(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await PricingService.savePromotion({
        name: promoName,
        discountType: promoType,
        discountValue: Number(promoValue),
        startsOn: promoStarts,
        endsOn: promoEnds,
        skuScope: promoSkus
          .split(/[,\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        categoryScope: promoCategories
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        storeId: profile?.storeId ?? null,
        actorId: userId,
      })
      setPromoName("")
      setTick((t) => t + 1)
    } catch (err) {
      setError(
        err instanceof PricingError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save promotion."
      )
    } finally {
      setBusy(false)
    }
  }

  async function saveCoupon(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await PricingService.saveCoupon({
        code: couponCode,
        discountType: couponType,
        discountValue: Number(couponValue),
        startsOn: couponStarts,
        endsOn: couponEnds,
        minSubtotalRupees: Number(couponMin) || 0,
        segmentScope: couponSegments
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        storeId: profile?.storeId ?? null,
        actorId: userId,
      })
      setCouponCode("")
      setCouponSegments("")
      setTick((t) => t + 1)
    } catch (err) {
      setError(
        err instanceof PricingError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save coupon."
      )
    } finally {
      setBusy(false)
    }
  }

  async function togglePromo(row: PromotionRecord) {
    if (!requireAdminPasscode()) return
    setBusy(true)
    try {
      await PricingService.savePromotion({
        id: row.id,
        name: row.name,
        active: !row.active,
        discountType: row.discountType,
        discountValue:
          row.discountType === "FIXED" ? row.discountValue / 100 : row.discountValue,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        skuScope: row.skuScope,
        categoryScope: row.categoryScope,
        priority: row.priority,
        notes: row.notes,
        storeId: row.storeId,
        actorId: userId,
      })
      setTick((t) => t + 1)
    } finally {
      setBusy(false)
    }
  }

  async function toggleCoupon(row: CouponRecord) {
    if (!requireAdminPasscode()) return
    setBusy(true)
    try {
      await PricingService.saveCoupon({
        id: row.id,
        code: row.code,
        name: row.name,
        active: !row.active,
        discountType: row.discountType,
        discountValue:
          row.discountType === "FIXED" ? row.discountValue / 100 : row.discountValue,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        minSubtotalRupees: row.minSubtotalPaisa / 100,
        maxRedemptions: row.maxRedemptions,
        segmentScope: row.segmentScope || [],
        notes: row.notes,
        storeId: row.storeId,
        actorId: userId,
      })
      setTick((t) => t + 1)
    } finally {
      setBusy(false)
    }
  }

  async function explainInvoice(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExplainLines(null)
    const id = explainInvoiceId.trim().toUpperCase()
    if (!id) {
      setError("Enter an invoice id.")
      return
    }
    const sale = await invoiceRepository.getById(id)
    if (!sale) {
      setError("Invoice not found.")
      return
    }
    setExplainLines(
      sale.lines.map((line) => ({
        name: `${line.name} (${line.weight}) × ${line.qty}`,
        explanation: PricingService.explainSaleLine(line.priceSnapshot),
      }))
    )
  }

  function formatPromoValue(row: PromotionRecord) {
    return row.discountType === "PERCENT"
      ? `${row.discountValue}%`
      : formatMoney(row.discountValue)
  }

  function formatCouponValue(row: CouponRecord) {
    return row.discountType === "PERCENT"
      ? `${row.discountValue}%`
      : formatMoney(row.discountValue)
  }

  function formatHistory(row: PriceHistoryRecord) {
    return `${formatMoney(row.oldSellingPricePaisa)} → ${formatMoney(row.newSellingPricePaisa)}`
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Promotions Management</h2>
          <p className="text-sm text-muted-foreground">
            Discounts, loyalty, campaigns, points→₹ mapping, birthday & free-item
            promos. Enable/disable switches need the admin passcode.
          </p>
        </div>
        <Link
          to="/utilities"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Utilities
        </Link>
      </div>

      <div className="space-y-1.5 rounded-lg border border-border p-3">
        <Label htmlFor="promo-admin-pass">Admin passcode (for enable/disable)</Label>
        <Input
          id="promo-admin-pass"
          type="password"
          autoComplete="current-password"
          value={adminPasscode}
          onChange={(e) => setAdminPasscode(e.target.value)}
          placeholder="Required to toggle promotions"
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="masters">Switches</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
          <TabsTrigger value="birthday">Birthday</TabsTrigger>
          <TabsTrigger value="promotions">Product</TabsTrigger>
          <TabsTrigger value="coupons">Campaigns</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="explain">Why?</TabsTrigger>
        </TabsList>

        <TabsContent value="masters" className="mt-4 space-y-4">
          <div className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">
              Festival / campaign discounts can stack. Enable any combination of
              Points, Punch %, and Free item — cashiers pick what to apply on
              each POS sale. Disabled options stay hidden on POS.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Product promotions</p>
                <p className="text-xs text-muted-foreground">
                  SKU / category line discounts at POS
                </p>
              </div>
              <Switch
                checked={settings.masters.productPromotionsEnabled}
                onCheckedChange={(on) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      productPromotionsEnabled: on,
                    },
                  })
                  refreshSettings()
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  Festival / campaign promotions
                </p>
                <p className="text-xs text-muted-foreground">
                  Coupons, occasion & birthday — additional discounts OK
                </p>
              </div>
              <Switch
                checked={settings.masters.orderPromotionsEnabled}
                onCheckedChange={(on) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      orderPromotionsEnabled: on,
                    },
                  })
                  refreshSettings()
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Punch card (digital)</p>
                <p className="text-xs text-muted-foreground">
                  Stamp punches on paid sales (mirrors physical card) + receipt
                </p>
              </div>
              <Switch
                checked={settings.masters.punchCardEnabled}
                onCheckedChange={(on) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      punchCardEnabled: on,
                    },
                  })
                  refreshSettings()
                }}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">POS loyalty offers</p>
            <p className="text-xs text-muted-foreground">
              Check one or all — each can be selected on a sale when enabled.
            </p>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={settings.masters.pointsRedeemEnabled}
                onChange={(e) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      pointsRedeemEnabled: e.target.checked,
                    },
                  })
                  refreshSettings()
                }}
              />
              <span>
                <span className="block text-sm font-medium">
                  Points redemption
                </span>
                <span className="text-xs text-muted-foreground">
                  Redeem wallet points in step multiples
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={settings.masters.punchPercentEnabled}
                onChange={(e) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      punchPercentEnabled: e.target.checked,
                    },
                  })
                  refreshSettings()
                }}
              />
              <span>
                <span className="block text-sm font-medium">Punch % promo</span>
                <span className="text-xs text-muted-foreground">
                  Full punch card → percent off order
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={settings.masters.freeItemPromoEnabled}
                onChange={(e) => {
                  if (!requireAdminPasscode()) return
                  savePromoSettings({
                    masters: {
                      ...settings.masters,
                      freeItemPromoEnabled: e.target.checked,
                    },
                  })
                  refreshSettings()
                }}
              />
              <span>
                <span className="block text-sm font-medium">Free item promo</span>
                <span className="text-xs text-muted-foreground">
                  Full punch card → choose a free item
                </span>
              </span>
            </label>
          </div>
        </TabsContent>

        <TabsContent value="loyalty" className="mt-4 space-y-4">
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              savePromoSettings({
                loyaltyRedeem: {
                  points: Number(settings.loyaltyRedeem.points) || 1000,
                  rupees: Number(settings.loyaltyRedeem.rupees) || 10,
                  step: Number(settings.loyaltyRedeem.step) || 500,
                },
                punchRules: {
                  minBillPaisa: Math.max(
                    0,
                    Math.round(Number(settings.punchRules.minBillPaisa) || 0)
                  ),
                  skuScope: settings.punchRules.skuScope,
                  categoryScope: settings.punchRules.categoryScope,
                  minUnitGrams: Math.max(
                    0,
                    Math.floor(Number(settings.punchRules.minUnitGrams) || 0)
                  ),
                  minQty: Math.max(
                    1,
                    Math.floor(Number(settings.punchRules.minQty) || 1)
                  ),
                },
                welcomePromo: {
                  enabled: settings.welcomePromo.enabled !== false,
                  grantPoints: Math.max(
                    0,
                    Math.floor(Number(settings.welcomePromo.grantPoints) || 0)
                  ),
                  redeemPerVisit: Math.max(
                    0,
                    Math.floor(
                      Number(settings.welcomePromo.redeemPerVisit) || 0
                    )
                  ),
                  visitLimit: Math.max(
                    1,
                    Math.floor(Number(settings.welcomePromo.visitLimit) || 2)
                  ),
                },
                earnPaisaPerPoint: settings.earnPaisaPerPoint,
                punchesRequired: settings.punchesRequired,
                percentReward: settings.percentReward,
                percentRewardLabel: settings.percentRewardLabel,
              })
              refreshSettings()
            }}
          >
            <p className="text-sm font-medium">Points → discount mapping</p>
            <p className="text-xs text-muted-foreground">
              Default {formatRedeemMappingLabel()}. Redeem only in multiples of
              the step (e.g. 1670 pts → 1500 redeemable).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Points</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.loyaltyRedeem.points}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      loyaltyRedeem: {
                        ...s.loyaltyRedeem,
                        points: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>= Rupees</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={settings.loyaltyRedeem.rupees}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      loyaltyRedeem: {
                        ...s.loyaltyRedeem,
                        rupees: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Redeem step</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.loyaltyRedeem.step}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      loyaltyRedeem: {
                        ...s.loyaltyRedeem,
                        step: Number(e.target.value) || 500,
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Earn (paisa per point)</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.earnPaisaPerPoint}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      earnPaisaPerPoint: Number(e.target.value) || 100,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  100 = 1 point per ₹1 spent
                </p>
              </div>
              <div className="space-y-1">
                <Label>Punches required</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.punchesRequired}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchesRequired: Number(e.target.value) || 5,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Punch % reward</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.percentReward}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      percentReward: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Punch reward label</Label>
                <Input
                  value={settings.percentRewardLabel}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      percentRewardLabel: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Effective now: {formatRedeemMappingLabel()} · step{" "}
              {getEffectiveLoyalty().redeemStep}
            </p>

            <p className="pt-2 text-sm font-medium">Punch stamp rules</p>
            <p className="text-xs text-muted-foreground">
              Digital punches mirror the physical card (fallback when guest is
              not registered). Default: Halwa category packs 500g and above.
              Manage SKUs and categories below.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Min bill (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={settings.punchRules.minBillPaisa / 100}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchRules: {
                        ...s.punchRules,
                        minBillPaisa: Math.round(
                          (Number(e.target.value) || 0) * 100
                        ),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Min qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.punchRules.minQty}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchRules: {
                        ...s.punchRules,
                        minQty: Number(e.target.value) || 1,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Min pack size (grams)</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.punchRules.minUnitGrams}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchRules: {
                        ...s.punchRules,
                        minUnitGrams: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0)
                        ),
                      },
                    }))
                  }
                  placeholder="500"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Category scope (comma list)</Label>
                <Input
                  value={settings.punchRules.categoryScope.join(", ")}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchRules: {
                        ...s.punchRules,
                        categoryScope: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    }))
                  }
                  placeholder="Halwa"
                />
                <p className="text-[11px] text-muted-foreground">
                  Matches category names containing these words (e.g. Halwa →
                  Madugula Halwa). Combined with SKU list via OR.
                </p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>SKU scope (optional extras)</Label>
                <Input
                  value={settings.punchRules.skuScope.join(", ")}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      punchRules: {
                        ...s.punchRules,
                        skuScope: e.target.value
                          .split(/[,\s]+/)
                          .map((x) => x.trim().toUpperCase())
                          .filter(Boolean),
                      },
                    }))
                  }
                  placeholder="MH-BL-0500, MH-BL-0101"
                />
              </div>
            </div>

            <p className="pt-2 text-sm font-medium">Welcome promo (new POS customers)</p>
            <p className="text-xs text-muted-foreground">
              Onboard with phone → name, email, DOB. Grant promo points for the
              first {settings.welcomePromo.visitLimit} visits (
              {settings.welcomePromo.redeemPerVisit} redeemable per visit).
              Earned points unlock after those visits when promo is used up.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Grant points</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={settings.welcomePromo.grantPoints}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      welcomePromo: {
                        ...s.welcomePromo,
                        grantPoints: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0)
                        ),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Redeem / visit</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={settings.welcomePromo.redeemPerVisit}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      welcomePromo: {
                        ...s.welcomePromo,
                        redeemPerVisit: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0)
                        ),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Visit limit</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.welcomePromo.visitLimit}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      welcomePromo: {
                        ...s.welcomePromo,
                        visitLimit: Math.max(
                          1,
                          Math.floor(Number(e.target.value) || 2)
                        ),
                      },
                    }))
                  }
                />
              </div>
            </div>

            <Button type="submit">Save loyalty settings</Button>
          </form>

          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Free item promo catalog</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Punch-card free items offered on POS Loyalty when punches are ready.
            </p>
            <ul className="space-y-2">
              {LOYALTY_REWARD_ITEMS.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-2 text-sm"
                >
                  <span>
                    {item.name} · {item.weight}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="discounts" className="mt-4 space-y-4">
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              savePromoSettings({
                occasion: settings.occasion,
                friendsAndFamily: settings.friendsAndFamily,
              })
              refreshSettings()
            }}
          >
            <p className="text-sm font-medium">Occasion / festival campaign</p>
            <div className="flex items-center justify-between gap-3">
              <Label>Active</Label>
              <Switch
                checked={settings.occasion.active}
                onCheckedChange={(on) => {
                  if (!requireAdminPasscode()) return
                  setSettings((s) => ({
                    ...s,
                    occasion: { ...s.occasion, active: on },
                  }))
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={settings.occasion.name}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      occasion: { ...s.occasion, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Percent</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.occasion.percent}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      occasion: {
                        ...s.occasion,
                        percent: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>F&amp;F max %</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.friendsAndFamily.maxPercent}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      friendsAndFamily: {
                        ...s.friendsAndFamily,
                        maxPercent: Number(e.target.value) || 50,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Starts</Label>
                <Input
                  type="date"
                  value={settings.occasion.startsOn}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      occasion: { ...s.occasion, startsOn: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Ends</Label>
                <Input
                  type="date"
                  value={settings.occasion.endsOn}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      occasion: { ...s.occasion, endsOn: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <Button type="submit">Save discounts</Button>
          </form>
        </TabsContent>

        <TabsContent value="birthday" className="mt-4 space-y-4">
          <form
            className="space-y-3 rounded-lg border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              savePromoSettings({ birthday: settings.birthday })
              refreshSettings()
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Birthday promo</p>
                <p className="text-xs text-muted-foreground">
                  Auto % off when attached customer birthday is in window
                </p>
              </div>
              <Switch
                checked={settings.birthday.active}
                onCheckedChange={(on) => {
                  if (!requireAdminPasscode()) return
                  setSettings((s) => ({
                    ...s,
                    birthday: { ...s.birthday, active: on },
                  }))
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Percent</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.birthday.percent}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      birthday: {
                        ...s.birthday,
                        percent: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Label</Label>
                <Input
                  value={settings.birthday.label}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      birthday: { ...s.birthday, label: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Days before</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.birthday.daysBefore}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      birthday: {
                        ...s.birthday,
                        daysBefore: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Days after</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.birthday.daysAfter}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      birthday: {
                        ...s.birthday,
                        daysAfter: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>
            <Button type="submit">Save birthday promo</Button>
          </form>
        </TabsContent>

        <TabsContent value="promotions" className="mt-4 space-y-4">
          <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={(e) => void savePromo(e)}>
            <p className="text-sm font-medium">New product promotion</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="promo-name">Name</Label>
                <Input
                  id="promo-name"
                  value={promoName}
                  onChange={(e) => setPromoName(e.target.value)}
                  placeholder="Weekend 10% off snacks"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-type">Type</Label>
                <select
                  id="promo-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={promoType}
                  onChange={(e) =>
                    setPromoType(e.target.value as "PERCENT" | "FIXED")
                  }
                >
                  <option value="PERCENT">Percent off unit</option>
                  <option value="FIXED">Fixed ₹ off unit</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-value">Value</Label>
                <Input
                  id="promo-value"
                  type="number"
                  min={0}
                  step="any"
                  value={promoValue}
                  onChange={(e) => setPromoValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-starts">Starts</Label>
                <Input
                  id="promo-starts"
                  type="date"
                  value={promoStarts}
                  onChange={(e) => setPromoStarts(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-ends">Ends</Label>
                <Input
                  id="promo-ends"
                  type="date"
                  value={promoEnds}
                  onChange={(e) => setPromoEnds(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-skus">SKU scope (blank = all)</Label>
                <Input
                  id="promo-skus"
                  value={promoSkus}
                  onChange={(e) => setPromoSkus(e.target.value)}
                  placeholder="SKU1, SKU2"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-cats">Categories (blank = any)</Label>
                <Input
                  id="promo-cats"
                  value={promoCategories}
                  onChange={(e) => setPromoCategories(e.target.value)}
                  placeholder="Snacks, Beverages"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy}>
              Save promotion
            </Button>
          </form>

          <ul className="space-y-2">
            {promotions.length === 0 ? (
              <li className="text-sm text-muted-foreground">No promotions yet.</li>
            ) : (
              promotions.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {row.name}{" "}
                      <span
                        className={cn(
                          "text-xs",
                          row.active
                            ? "text-muted-foreground"
                            : "text-destructive"
                        )}
                      >
                        {row.active ? "active" : "off"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPromoValue(row)} · {row.startsOn} → {row.endsOn}
                      {row.skuScope.length
                        ? ` · SKUs ${row.skuScope.join(", ")}`
                        : ""}
                      {row.categoryScope.length
                        ? ` · ${row.categoryScope.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void togglePromo(row)}
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="coupons" className="mt-4 space-y-4">
          <form
            className="space-y-3 rounded-lg border border-border p-3"
            onSubmit={(e) => void saveCoupon(e)}
          >
            <p className="text-sm font-medium">New campaign coupon</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cpn-code">Code</Label>
                <Input
                  id="cpn-code"
                  value={couponCode}
                  onChange={(e) =>
                    setCouponCode(e.target.value.toUpperCase())
                  }
                  placeholder="SAVE10"
                  autoCapitalize="characters"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpn-type">Type</Label>
                <select
                  id="cpn-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={couponType}
                  onChange={(e) =>
                    setCouponType(e.target.value as "PERCENT" | "FIXED")
                  }
                >
                  <option value="PERCENT">Percent off order</option>
                  <option value="FIXED">Fixed ₹ off order</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpn-value">Value</Label>
                <Input
                  id="cpn-value"
                  type="number"
                  min={0}
                  step="any"
                  value={couponValue}
                  onChange={(e) => setCouponValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpn-starts">Starts</Label>
                <Input
                  id="cpn-starts"
                  type="date"
                  value={couponStarts}
                  onChange={(e) => setCouponStarts(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpn-ends">Ends</Label>
                <Input
                  id="cpn-ends"
                  type="date"
                  value={couponEnds}
                  onChange={(e) => setCouponEnds(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cpn-min">Min subtotal (₹)</Label>
                <Input
                  id="cpn-min"
                  type="number"
                  min={0}
                  step="any"
                  value={couponMin}
                  onChange={(e) => setCouponMin(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cpn-seg">
                  Segment scope (blank = all; e.g. vip, regular, new)
                </Label>
                <Input
                  id="cpn-seg"
                  value={couponSegments}
                  onChange={(e) => setCouponSegments(e.target.value)}
                  placeholder="vip, regular"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy}>
              Save coupon
            </Button>
          </form>

          <ul className="space-y-2">
            {coupons.length === 0 ? (
              <li className="text-sm text-muted-foreground">No coupons yet.</li>
            ) : (
              coupons.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {row.code}{" "}
                      <span
                        className={cn(
                          "text-xs",
                          row.active
                            ? "text-muted-foreground"
                            : "text-destructive"
                        )}
                      >
                        {row.active ? "active" : "off"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCouponValue(row)} · {row.startsOn} → {row.endsOn} ·
                      used {row.redemptionCount}
                      {row.maxRedemptions != null
                        ? `/${row.maxRedemptions}`
                        : ""}
                      {row.segmentScope?.length
                        ? ` · segments ${row.segmentScope.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void toggleCoupon(row)}
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="hist-sku">Filter SKU</Label>
            <Input
              id="hist-sku"
              value={historySku}
              onChange={(e) => setHistorySku(e.target.value.toUpperCase())}
              placeholder="Leave blank for all"
            />
          </div>
          <ul className="space-y-2">
            {history.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                No catalog price changes recorded yet.
              </li>
            ) : (
              history.slice(0, 50).map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    {row.sku} · {row.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatHistory(row)} ·{" "}
                    {new Date(row.changedAt).toLocaleString("en-IN")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="explain" className="mt-4 space-y-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => void explainInvoice(e)}
          >
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="explain-inv">Invoice id</Label>
              <Input
                id="explain-inv"
                value={explainInvoiceId}
                onChange={(e) => setExplainInvoiceId(e.target.value)}
                placeholder="INV-20260812-00001"
              />
            </div>
            <Button type="submit">Explain prices</Button>
          </form>
          {explainLines ? (
            <ul className="space-y-2">
              {explainLines.map((row, i) => (
                <li
                  key={`${row.name}-${i}`}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.explanation}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Look up a paid invoice to read frozen line snapshots — answers
              “why ₹45 instead of ₹50?” without today’s catalog.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
