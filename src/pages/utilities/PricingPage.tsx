import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMoney } from "@/lib/money"
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
 * Utilities → Pricing — promotions, coupons, price history, invoice explain.
 */
export function PricingPage() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState("promotions")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
  }, [])

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
          <h2 className="text-lg font-semibold">Pricing</h2>
          <p className="text-sm text-muted-foreground">
            Promotions, coupons, and sell-price history. Sale lines keep a frozen
            price snapshot so you can explain why an item sold below list.
          </p>
        </div>
        <Link
          to="/utilities"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Utilities
        </Link>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="promotions">Promos</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="explain">Why?</TabsTrigger>
        </TabsList>

        <TabsContent value="promotions" className="mt-4 space-y-4">
          <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={(e) => void savePromo(e)}>
            <p className="text-sm font-medium">New promotion</p>
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
            <p className="text-sm font-medium">New coupon</p>
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
