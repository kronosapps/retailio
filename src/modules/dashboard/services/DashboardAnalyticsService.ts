import type { RecordedSale } from "@/data/invoices"
import type { InventoryRecord } from "@/data/inventory"
import type { ProductRecord } from "@/data/products"
import type { Payment } from "@/modules/payment/types"
import type { RefundRecord } from "@/data/refunds"
import { customerRepository } from "@/repositories/CustomerRepository"
import { inventoryRepository } from "@/repositories/InventoryRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { productRepository } from "@/repositories/ProductRepository"
import { refundRepository } from "@/repositories/RefundRepository"

import { isInRange, resolveDashboardRange } from "./dateRanges"
import type {
  BusinessInsight,
  CustomerAnalytics,
  DashboardDateRange,
  DashboardMetrics,
  DashboardRangePreset,
  InventoryAnalytics,
  KpiTrend,
  NamedValue,
  RecentSaleRow,
  SeriesPoint,
  StockRow,
  TodaySnapshot,
  TopProductRow,
} from "../types/dashboard"

const LOW_STOCK_THRESHOLD = 10

type LoadInput = {
  storeId: string | null
  preset: DashboardRangePreset
  customStart?: Date
  customEnd?: Date
}

function kpi(
  value: number,
  previousValue: number,
  format: KpiTrend["format"]
): KpiTrend {
  let changePercent: number | null = null
  if (previousValue === 0) {
    changePercent = value === 0 ? 0 : null
  } else {
    changePercent = ((value - previousValue) / Math.abs(previousValue)) * 100
  }
  const direction: KpiTrend["direction"] =
    changePercent === null
      ? value > 0
        ? "up"
        : "flat"
      : changePercent > 0.5
        ? "up"
        : changePercent < -0.5
          ? "down"
          : "flat"
  return { value, previousValue, changePercent, direction, format }
}

function filterByStore(
  invoices: RecordedSale[],
  storeId: string | null
): RecordedSale[] {
  if (!storeId) return invoices
  return invoices.filter(
    (sale) => !sale.storeId || sale.storeId === storeId
  )
}

function paidInvoices(
  invoices: RecordedSale[],
  payments: Payment[],
  refunds: RefundRecord[],
  start: Date,
  end: Date
): RecordedSale[] {
  const refundedIds = new Set(
    refunds
      .filter((r) => r.status === "Completed")
      .map((r) => r.invoiceId)
  )
  const paidIds = new Set(
    payments
      .filter((p) => p.status === "Paid")
      .map((p) => p.invoiceId)
  )
  return invoices.filter((sale) => {
    if (sale.paymentStatus === "Refunded" || refundedIds.has(sale.invoiceId)) {
      return false
    }
    const paid =
      sale.paymentStatus === "Paid" || paidIds.has(sale.invoiceId)
    if (!paid) return false
    return isInRange(sale.createdAt, start, end)
  })
}

function sumRevenue(sales: RecordedSale[]): number {
  return sales.reduce((sum, s) => sum + (s.totals?.total ?? 0), 0)
}

function sumRefunds(refunds: RefundRecord[], start: Date, end: Date): number {
  return refunds
    .filter(
      (r) =>
        r.status === "Completed" && isInRange(r.createdAt, start, end)
    )
    .reduce((sum, r) => sum + (r.amountPaisa ?? 0), 0)
}

function customerKey(sale: RecordedSale): string {
  if (sale.customerId) return `id:${sale.customerId}`
  const phone = (sale.customerPhone || "").replace(/\D/g, "")
  if (phone.length >= 8) return `phone:${phone.slice(-10)}`
  return `name:${(sale.customerName || "Walk-in").trim().toLowerCase() || "walk-in"}`
}

function uniqueCustomers(sales: RecordedSale[]): Set<string> {
  const set = new Set<string>()
  for (const s of sales) set.add(customerKey(s))
  return set
}

function estimateCogs(
  sales: RecordedSale[],
  productsBySku: Map<string, ProductRecord>,
  productsByItemId: Map<string, ProductRecord>
): { cogs: number; approximate: boolean } {
  let cogs = 0
  let missing = 0
  let lines = 0
  for (const sale of sales) {
    for (const line of sale.lines) {
      lines += 1
      const product =
        productsBySku.get(line.itemId) ||
        productsByItemId.get(line.itemId) ||
        null
      const unitCost = product?.purchasePricePaisa
      if (unitCost == null) {
        missing += 1
        continue
      }
      cogs += unitCost * line.qty
    }
  }
  return { cogs, approximate: missing > 0 || lines === 0 }
}

function buildProductMaps(products: ProductRecord[]) {
  const bySku = new Map<string, ProductRecord>()
  const byProductId = new Map<string, ProductRecord>()
  for (const p of products) {
    bySku.set(p.sku, p)
    bySku.set(p.id, p)
    byProductId.set(p.productId, p)
  }
  return { bySku, byProductId }
}

function productSales(
  sales: RecordedSale[]
): Map<string, { name: string; weight: string; qty: number; revenue: number }> {
  const map = new Map<
    string,
    { name: string; weight: string; qty: number; revenue: number }
  >()
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (line.isLoyaltyReward) continue
      const key = `${line.itemId}__${line.weight}`
      const prev = map.get(key) ?? {
        name: line.name,
        weight: line.weight,
        qty: 0,
        revenue: 0,
      }
      prev.qty += line.qty
      prev.revenue += line.lineTotalPaisa
      map.set(key, prev)
    }
  }
  return map
}

function paymentMethodBreakdown(
  sales: RecordedSale[],
  payments: Payment[]
): NamedValue[] {
  const byMethod = new Map<string, number>()
  const paymentByInvoice = new Map(
    payments.filter((p) => p.status === "Paid").map((p) => [p.invoiceId, p])
  )
  for (const sale of sales) {
    const pay = paymentByInvoice.get(sale.invoiceId)
    const method = pay?.paymentMethod || sale.paymentMethod || "Unknown"
    byMethod.set(method, (byMethod.get(method) ?? 0) + sale.totals.total)
  }
  return [...byMethod.entries()]
    .map(([name, value]) => ({ name, value: value / 100 }))
    .sort((a, b) => b.value - a.value)
}

function revenueTrend(
  sales: RecordedSale[],
  range: DashboardDateRange
): SeriesPoint[] {
  const spanDays =
    (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)
  const byDay = spanDays > 2

  const buckets = new Map<string, number>()
  for (const sale of sales) {
    const d = new Date(sale.createdAt)
    const key = byDay
      ? d.toISOString().slice(0, 10)
      : `${String(d.getHours()).padStart(2, "0")}:00`
    buckets.set(key, (buckets.get(key) ?? 0) + sale.totals.total)
  }

  if (!byDay) {
    // Fill 0–23 for today-style ranges
    const points: SeriesPoint[] = []
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, "0")}:00`
      points.push({
        key,
        label: key,
        value: (buckets.get(key) ?? 0) / 100,
      })
    }
    return points
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: key.slice(5),
      value: value / 100,
    }))
}

function hourlySales(sales: RecordedSale[]): SeriesPoint[] {
  const buckets = new Array(24).fill(0) as number[]
  for (const sale of sales) {
    const h = new Date(sale.createdAt).getHours()
    buckets[h] += sale.totals.total
  }
  return buckets.map((value, h) => ({
    key: String(h),
    label: `${String(h).padStart(2, "0")}:00`,
    value: value / 100,
  }))
}

function stockTables(inventory: InventoryRecord[]): {
  low: StockRow[]
  out: StockRow[]
} {
  const toRow = (item: InventoryRecord): StockRow => ({
    id: item.id,
    name: item.name,
    sku: item.sku ?? null,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category ?? null,
  })
  const out = inventory
    .filter((i) => i.quantity <= 0)
    .map(toRow)
    .sort((a, b) => a.name.localeCompare(b.name))
  const low = inventory
    .filter((i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD)
    .map(toRow)
    .sort((a, b) => a.quantity - b.quantity)
  return { low, out }
}

function inventoryAnalytics(
  inventory: InventoryRecord[],
  products: ProductRecord[]
): InventoryAnalytics {
  const priceBySku = new Map(
    products.map((p) => [p.sku, p.sellingPricePaisa] as const)
  )
  let inventoryValuePaisa = 0
  for (const item of inventory) {
    const unit =
      (item.sku && priceBySku.get(item.sku)) ||
      products.find((p) => p.productId === item.productId)?.sellingPricePaisa ||
      0
    inventoryValuePaisa += Math.max(0, item.quantity) * unit
  }
  return {
    totalProducts: products.filter((p) => p.active).length,
    inventoryValuePaisa,
    lowStockCount: inventory.filter(
      (i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD
    ).length,
    outOfStockCount: inventory.filter((i) => i.quantity <= 0).length,
    inactiveProducts: products.filter((p) => !p.active).length,
    damagedProducts: 0,
  }
}

function customerAnalytics(
  periodSales: RecordedSale[],
  allSales: RecordedSale[],
  range: DashboardDateRange
): CustomerAnalytics {
  const spend = new Map<string, number>()
  const labels = new Map<string, string>()
  const firstSeen = new Map<string, number>()

  const directory = customerRepository.list()
  const byId = new Map(directory.map((c) => [c.id, c]))

  for (const sale of allSales) {
    const key = customerKey(sale)
    const t = new Date(sale.createdAt).getTime()
    const prev = firstSeen.get(key)
    if (prev == null || t < prev) firstSeen.set(key, t)

    if (!labels.has(key)) {
      const fromDir = sale.customerId ? byId.get(sale.customerId) : null
      labels.set(
        key,
        fromDir?.name || sale.customerName || "Walk-in"
      )
    }
  }

  // Prefer repository createdAt for brand-new directory customers with no sales yet
  for (const customer of directory) {
    const key = `id:${customer.id}`
    const t = new Date(customer.createdAt).getTime()
    const prev = firstSeen.get(key)
    if (prev == null || t < prev) firstSeen.set(key, t)
    labels.set(key, customer.name)
  }

  let newCustomers = 0
  let returningCustomers = 0
  const periodKeys = new Set<string>()

  for (const sale of periodSales) {
    const key = customerKey(sale)
    periodKeys.add(key)
    spend.set(key, (spend.get(key) ?? 0) + sale.totals.total)
    labels.set(key, labels.get(key) || sale.customerName || "Walk-in")
  }

  for (const key of periodKeys) {
    const first = firstSeen.get(key) ?? 0
    if (first >= range.start.getTime() && first <= range.end.getTime()) {
      newCustomers += 1
    } else {
      returningCustomers += 1
    }
  }

  const total = newCustomers + returningCustomers
  const repeatPurchasePercent =
    total === 0 ? 0 : (returningCustomers / total) * 100

  let highest: CustomerAnalytics["highestSpendingCustomer"] = null
  for (const [key, spendPaisa] of spend) {
    if (!highest || spendPaisa > highest.spendPaisa) {
      highest = {
        name: labels.get(key) || key,
        spendPaisa,
      }
    }
  }

  return {
    newCustomers,
    returningCustomers,
    repeatPurchasePercent,
    highestSpendingCustomer: highest,
  }
}

function buildInsights(input: {
  revenueChange: number | null
  upiShare: number
  bestSeller: string | null
  lowStock: number
  orders: number
}): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  if (input.revenueChange != null) {
    const abs = Math.abs(input.revenueChange).toFixed(0)
    insights.push({
      id: "rev",
      tone: input.revenueChange >= 0 ? "positive" : "warning",
      message:
        input.revenueChange >= 0
          ? `Revenue increased by ${abs}% vs the previous period.`
          : `Revenue decreased by ${abs}% vs the previous period.`,
    })
  }
  if (input.orders > 0) {
    insights.push({
      id: "upi",
      tone: "neutral",
      message: `UPI contributes ${input.upiShare.toFixed(0)}% of sales in this period.`,
    })
  }
  if (input.bestSeller) {
    insights.push({
      id: "best",
      tone: "positive",
      message: `${input.bestSeller} is the best-selling product.`,
    })
  }
  if (input.lowStock > 0) {
    insights.push({
      id: "stock",
      tone: "warning",
      message: `${input.lowStock} product${input.lowStock === 1 ? "" : "s"} require restocking.`,
    })
  }
  if (insights.length === 0) {
    insights.push({
      id: "empty",
      tone: "neutral",
      message: "No sales in this period yet — start a sale from POS.",
    })
  }
  return insights
}

function buildSnapshot(
  todaySales: RecordedSale[],
  payments: Payment[],
  inventory: InventoryRecord[],
  productMap: Map<
    string,
    { name: string; weight: string; qty: number; revenue: number }
  >
): TodaySnapshot {
  const revenuePaisa = sumRevenue(todaySales)
  const methods = paymentMethodBreakdown(todaySales, payments)
  const upi = methods.find((m) => m.name === "UPI")?.value ?? 0
  const totalMethod = methods.reduce((s, m) => s + m.value, 0)
  const upiSharePercent = totalMethod > 0 ? (upi / totalMethod) * 100 : 0
  const top = [...productMap.values()].sort((a, b) => b.qty - a.qty)[0]
  return {
    revenuePaisa,
    orders: todaySales.length,
    customers: uniqueCustomers(todaySales).size,
    bestSellerName: top ? `${top.name} ${top.weight}` : null,
    lowStockCount: inventory.filter(
      (i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD
    ).length,
    upiSharePercent,
  }
}

/**
 * Aggregates repository data into a single DashboardMetrics object.
 * React components must not recalculate business metrics.
 */
export class DashboardAnalyticsService {
  static async load(input: LoadInput): Promise<DashboardMetrics> {
    const range = resolveDashboardRange(input.preset, {
      start: input.customStart ?? new Date(),
      end: input.customEnd ?? new Date(),
    })

    const [invoicesRaw, payments] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
    ])
    const products = productRepository.list().filter(
      (p) => !input.storeId || !p.storeId || p.storeId === input.storeId
    )
    const inventory = inventoryRepository.list().filter(
      (i) => !input.storeId || !i.storeId || i.storeId === input.storeId
    )
    const refunds = refundRepository.list().filter(
      (r) => !input.storeId || !r.storeId || r.storeId === input.storeId
    )

    const invoices = filterByStore(invoicesRaw, input.storeId)
    const { bySku } = buildProductMaps(products)

    const periodSales = paidInvoices(
      invoices,
      payments,
      refunds,
      range.start,
      range.end
    )
    const previousSales = paidInvoices(
      invoices,
      payments,
      refunds,
      range.previousStart,
      range.previousEnd
    )
    const refundTotal = sumRefunds(refunds, range.start, range.end)
    const prevRefundTotal = sumRefunds(
      refunds,
      range.previousStart,
      range.previousEnd
    )

    const revenue = sumRevenue(periodSales)
    const prevRevenue = sumRevenue(previousSales)
    const orders = periodSales.length
    const prevOrders = previousSales.length
    const customers = uniqueCustomers(periodSales).size
    const prevCustomers = uniqueCustomers(previousSales).size
    const aov = orders > 0 ? revenue / orders : 0
    const prevAov = prevOrders > 0 ? prevRevenue / prevOrders : 0

    const cogsNow = estimateCogs(periodSales, bySku, bySku)
    const cogsPrev = estimateCogs(previousSales, bySku, bySku)
    const profit = Math.max(0, revenue - cogsNow.cogs)
    const prevProfit = Math.max(0, prevRevenue - cogsPrev.cogs)

    const inv = inventoryAnalytics(inventory, products)
    const pending = payments
      .filter((p) => p.status === "Pending")
      .reduce((s, p) => s + p.amountPaisa, 0)

    const prodSales = productSales(periodSales)
    const topList = [...prodSales.entries()]
      .map(([key, v]) => ({
        sku: key.split("__")[0] || key,
        name: v.name,
        weight: v.weight,
        qtySold: v.qty,
        revenuePaisa: v.revenue,
      }))
      .sort((a, b) => b.qtySold - a.qtySold)

    const topProducts: TopProductRow[] = topList.slice(0, 10)
    const chartTop: NamedValue[] = topList.slice(0, 8).map((p) => ({
      name: `${p.name} ${p.weight}`,
      value: p.qtySold,
    }))

    const methods = paymentMethodBreakdown(periodSales, payments)
    const upiShare =
      methods.length === 0
        ? 0
        : ((methods.find((m) => m.name === "UPI")?.value ?? 0) /
            methods.reduce((s, m) => s + m.value, 0)) *
          100

    const stock = stockTables(inventory)
    const customersBlock = customerAnalytics(periodSales, invoices, range)

    const todayRange = resolveDashboardRange("today")
    const todaySales = paidInvoices(
      invoices,
      payments,
      refunds,
      todayRange.start,
      todayRange.end
    )
    const snapshot = buildSnapshot(
      todaySales,
      payments,
      inventory,
      productSales(todaySales)
    )

    const revenueChange = kpi(revenue, prevRevenue, "currency").changePercent

    const recentSales: RecentSaleRow[] = [...periodSales]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map((s) => ({
        invoiceId: s.invoiceId,
        createdAt: s.createdAt,
        customerName: s.customerName || "Walk-in",
        paymentMethod: s.paymentMethod ?? null,
        totalPaisa: s.totals.total,
        status: s.paymentStatus || "Pending",
        canRefund: s.paymentStatus === "Paid",
      }))

    // Fix unused var in categorySales - clean that function
    const categories = categorySalesClean(periodSales, products)

    return {
      generatedAt: new Date().toISOString(),
      storeId: input.storeId,
      range,
      snapshot,
      kpis: {
        totalRevenue: kpi(revenue, prevRevenue, "currency"),
        grossProfit: kpi(profit, prevProfit, "currency"),
        orders: kpi(orders, prevOrders, "number"),
        averageOrderValue: kpi(aov, prevAov, "currency"),
        customers: kpi(customers, prevCustomers, "number"),
        inventoryValue: kpi(
          inv.inventoryValuePaisa,
          inv.inventoryValuePaisa,
          "currency"
        ),
        pendingPayments: kpi(pending, pending, "currency"),
        refunds: kpi(refundTotal, prevRefundTotal, "currency"),
      },
      charts: {
        revenueTrend: revenueTrend(periodSales, range),
        paymentMethods: methods,
        categorySales: categories,
        topProducts: chartTop,
        hourlySales: hourlySales(periodSales),
      },
      tables: {
        topProducts,
        recentSales,
        lowStock: stock.low.slice(0, 20),
        outOfStock: stock.out.slice(0, 20),
      },
      customers: customersBlock,
      inventory: inv,
      insights: buildInsights({
        revenueChange,
        upiShare: Number.isFinite(upiShare) ? upiShare : 0,
        bestSeller: topProducts[0]
          ? `${topProducts[0].name} ${topProducts[0].weight}`
          : null,
        lowStock: inv.lowStockCount,
        orders,
      }),
      meta: {
        profitApproximate: cogsNow.approximate,
        refundsSupported: true,
        damagedSupported: false,
      },
    }
  }
}

function categorySalesClean(
  sales: RecordedSale[],
  products: ProductRecord[]
): NamedValue[] {
  const productCat = new Map<string, string>()
  for (const p of products) {
    productCat.set(p.sku, p.category)
    productCat.set(p.id, p.category)
    productCat.set(p.productId, p.category)
  }
  const byCategory = new Map<string, number>()
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (line.isLoyaltyReward) continue
      const category = productCat.get(line.itemId) || "Other"
      byCategory.set(
        category,
        (byCategory.get(category) ?? 0) + line.lineTotalPaisa
      )
    }
  }
  return [...byCategory.entries()]
    .map(([name, value]) => ({ name, value: value / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}
