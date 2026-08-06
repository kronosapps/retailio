/** Dashboard domain types — future-ready for multi-store / AI / GST modules. */

export type DashboardRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "custom"

export type DashboardDateRange = {
  preset: DashboardRangePreset
  label: string
  start: Date
  end: Date
  /** Matching previous window for comparisons */
  previousStart: Date
  previousEnd: Date
}

export type KpiTrend = {
  value: number
  previousValue: number
  /** Percent change vs previous period; null if previous was 0 */
  changePercent: number | null
  direction: "up" | "down" | "flat"
  /** Display unit hint */
  format: "currency" | "number" | "percent"
}

export type TodaySnapshot = {
  revenuePaisa: number
  orders: number
  customers: number
  bestSellerName: string | null
  lowStockCount: number
  upiSharePercent: number
}

export type SeriesPoint = {
  key: string
  label: string
  value: number
}

export type NamedValue = {
  name: string
  value: number
  meta?: string
}

export type TopProductRow = {
  sku: string
  name: string
  weight: string
  qtySold: number
  revenuePaisa: number
}

export type RecentSaleRow = {
  invoiceId: string
  createdAt: string
  customerName: string
  paymentMethod: string | null
  totalPaisa: number
  status: string
  canRefund?: boolean
}

export type StockRow = {
  id: string
  name: string
  sku: string | null
  quantity: number
  unit: string
  category: string | null
}

export type CustomerAnalytics = {
  newCustomers: number
  returningCustomers: number
  repeatPurchasePercent: number
  highestSpendingCustomer: {
    name: string
    spendPaisa: number
  } | null
}

export type InventoryAnalytics = {
  totalProducts: number
  inventoryValuePaisa: number
  lowStockCount: number
  outOfStockCount: number
  inactiveProducts: number
  /** Reserved — no damaged model yet */
  damagedProducts: number
}

export type BusinessInsight = {
  id: string
  tone: "positive" | "neutral" | "warning"
  message: string
}

export type DashboardMetrics = {
  generatedAt: string
  storeId: string | null
  range: DashboardDateRange
  snapshot: TodaySnapshot
  kpis: {
    totalRevenue: KpiTrend
    grossProfit: KpiTrend
    orders: KpiTrend
    averageOrderValue: KpiTrend
    customers: KpiTrend
    inventoryValue: KpiTrend
    pendingPayments: KpiTrend
    refunds: KpiTrend
  }
  charts: {
    revenueTrend: SeriesPoint[]
    paymentMethods: NamedValue[]
    categorySales: NamedValue[]
    topProducts: NamedValue[]
    hourlySales: SeriesPoint[]
  }
  tables: {
    topProducts: TopProductRow[]
    recentSales: RecentSaleRow[]
    lowStock: StockRow[]
    outOfStock: StockRow[]
  }
  customers: CustomerAnalytics
  inventory: InventoryAnalytics
  insights: BusinessInsight[]
  meta: {
    /** True when purchase prices missing — profit is approximate */
    profitApproximate: boolean
    refundsSupported: boolean
    damagedSupported: boolean
  }
}

/** Extensibility stubs for later modules */
export type DashboardFutureHooks = {
  multiStore?: boolean
  cashierComparison?: boolean
  branchAnalytics?: boolean
  aiInsights?: boolean
  forecasting?: boolean
  supplierAnalytics?: boolean
  gstDashboard?: boolean
}
