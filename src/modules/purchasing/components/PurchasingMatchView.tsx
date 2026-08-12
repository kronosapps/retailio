import { useMemo, useState } from "react"
import { Download } from "lucide-react"

import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/money"
import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"
import {
  PurchaseOrderService,
  PurchaseReceivingService,
  PurchaseReturnService,
  SupplierInvoiceService,
  remainingQty,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { cn } from "@/lib/utils"

type MatchStatus = "Matched" | "Unbilled" | "Variance" | "Open PO"

type MatchRow = {
  key: string
  supplierName: string
  poNumber: string | null
  grnNumber: string | null
  invoiceNumber: string | null
  receivedQty: number
  billedQty: number
  returnedQty: number
  receivedPaisa: number
  billedPaisa: number
  variancePaisa: number
  status: MatchStatus
}

type SupplierSpendRow = {
  supplierId: string
  supplierName: string
  invoiceCount: number
  billedPaisa: number
  paidPaisa: number
  creditedPaisa: number
  remainingPaisa: number
  returnPaisa: number
}

/**
 * Purchasing → Match — PO / GRN / Invoice 3-way view + spend by supplier.
 */
export function PurchasingMatchView() {
  const [tick, setTick] = useState(0)
  const [section, setSection] = useState<"match" | "spend">("match")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matchRows = useMemo(() => {
    void tick
    return buildMatchRows()
  }, [tick])

  const spendRows = useMemo(() => {
    void tick
    return buildSpendBySupplier()
  }, [tick])

  async function onExport() {
    setError(null)
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        reportType: "utility" as const,
        title:
          section === "match"
            ? "Purchasing 3-way match"
            : "Purchases by supplier",
        storeName: "RetailOS",
        periodLabel: "All time",
        generatedAt: now,
        filters: {
          preset: "custom" as const,
          startDate: now,
          endDate: now,
          storeId: null,
          category: null,
          productSku: null,
          staffId: null,
          paymentMethod: null,
        },
        sheets:
          section === "match"
            ? [
                {
                  name: "Match",
                  columns: [
                    "Supplier",
                    "PO",
                    "GRN",
                    "Invoice",
                    "Received qty",
                    "Billed qty",
                    "Returned qty",
                    "Received ₹",
                    "Billed ₹",
                    "Variance ₹",
                    "Status",
                  ],
                  rows: matchRows.map((r) => [
                    r.supplierName,
                    r.poNumber || "",
                    r.grnNumber || "",
                    r.invoiceNumber || "",
                    r.receivedQty,
                    r.billedQty,
                    r.returnedQty,
                    r.receivedPaisa / 100,
                    r.billedPaisa / 100,
                    r.variancePaisa / 100,
                    r.status,
                  ]),
                },
              ]
            : [
                {
                  name: "By supplier",
                  columns: [
                    "Supplier",
                    "Invoices",
                    "Billed ₹",
                    "Paid ₹",
                    "Credited ₹",
                    "Remaining ₹",
                    "Returns ₹",
                  ],
                  rows: spendRows.map((r) => [
                    r.supplierName,
                    r.invoiceCount,
                    r.billedPaisa / 100,
                    r.paidPaisa / 100,
                    r.creditedPaisa / 100,
                    r.remainingPaisa / 100,
                    r.returnPaisa / 100,
                  ]),
                },
              ],
      }
      await ExcelReportExporter.download(
        payload,
        section === "match"
          ? "purchasing-match.xlsx"
          : "purchases-by-supplier.xlsx"
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Match & spend</h2>
          <p className="text-sm text-muted-foreground">
            Three-way PO → GRN → Invoice match, GRN vs billed variance, and
            purchases by supplier.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void onExport()}
        >
          <Download className="size-4" />
          Export Excel
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        <button
          type="button"
          className={cn(
            "min-h-10 flex-1 rounded-md px-3 text-sm font-medium",
            section === "match"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
          onClick={() => setSection("match")}
        >
          3-way match
        </button>
        <button
          type="button"
          className={cn(
            "min-h-10 flex-1 rounded-md px-3 text-sm font-medium",
            section === "spend"
              ? "bg-background shadow-sm"
              : "text-muted-foreground"
          )}
          onClick={() => setSection("spend")}
        >
          By supplier
        </button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {section === "match" ? (
        <ResponsiveList
          cards={
            matchRows.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
                No purchase documents to match yet.
              </p>
            ) : (
              matchRows.map((r) => (
                  <MobileListCard
                    key={r.key}
                    title={r.grnNumber || r.poNumber || r.invoiceNumber || "—"}
                    meta={
                      <>
                        <div>{r.supplierName}</div>
                        <div>
                          Recv {r.receivedQty} · Bill {r.billedQty} · Ret{" "}
                          {r.returnedQty}
                        </div>
                        <div>
                          Variance {formatMoney(r.variancePaisa)}
                        </div>
                      </>
                    }
                    badge={<MatchBadge status={r.status} />}
                  />
                ))
            )
          }
          table={
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">PO</th>
                    <th className="px-3 py-2">GRN</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Recv / Bill / Ret</th>
                    <th className="px-3 py-2">Variance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matchRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-10 text-center text-muted-foreground"
                      >
                        No purchase documents to match yet.
                      </td>
                    </tr>
                  ) : (
                    matchRows.map((r) => (
                      <tr key={r.key} className="border-b last:border-0">
                        <td className="px-3 py-2">{r.supplierName}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.poNumber || "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.grnNumber || "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.invoiceNumber || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs">
                          {r.receivedQty} / {r.billedQty} / {r.returnedQty}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.variancePaisa)}
                        </td>
                        <td className="px-3 py-2">
                          <MatchBadge status={r.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      ) : (
        <ResponsiveList
          cards={
            spendRows.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
                No supplier spend yet.
              </p>
            ) : (
              spendRows.map((r) => (
                  <MobileListCard
                    key={r.supplierId}
                    title={r.supplierName}
                    meta={
                      <>
                        <div>
                          {r.invoiceCount} invoice
                          {r.invoiceCount === 1 ? "" : "s"} · Billed{" "}
                          {formatMoney(r.billedPaisa)}
                        </div>
                        <div>
                          Paid {formatMoney(r.paidPaisa)} · Due{" "}
                          {formatMoney(r.remainingPaisa)}
                        </div>
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
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2">Invoices</th>
                    <th className="px-3 py-2">Billed</th>
                    <th className="px-3 py-2">Paid</th>
                    <th className="px-3 py-2">Credited</th>
                    <th className="px-3 py-2">Remaining</th>
                    <th className="px-3 py-2">Returns</th>
                  </tr>
                </thead>
                <tbody>
                  {spendRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-10 text-center text-muted-foreground"
                      >
                        No supplier spend yet.
                      </td>
                    </tr>
                  ) : (
                    spendRows.map((r) => (
                      <tr key={r.supplierId} className="border-b last:border-0">
                        <td className="px-3 py-2">{r.supplierName}</td>
                        <td className="px-3 py-2 tabular-nums">{r.invoiceCount}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.billedPaisa)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.paidPaisa)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.creditedPaisa)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.remainingPaisa)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(r.returnPaisa)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      )}

      <p className="text-xs text-muted-foreground">
        <Label className="sr-only">Refresh hint</Label>
        Data is live from local purchasing stores.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => setTick((t) => t + 1)}
        >
          Refresh
        </button>
      </p>
    </div>
  )
}

function MatchBadge({ status }: { status: MatchStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        status === "Matched" && "bg-emerald-100 text-emerald-800",
        status === "Unbilled" && "bg-amber-100 text-amber-900",
        status === "Variance" && "bg-rose-100 text-rose-800",
        status === "Open PO" && "bg-sky-100 text-sky-900"
      )}
    >
      {status}
    </span>
  )
}

function buildMatchRows(): MatchRow[] {
  const invoices = SupplierInvoiceService.list().filter(
    (i) => i.status !== "CANCELLED"
  )
  const invoiceByGrn = new Map<string, (typeof invoices)[0]>()
  for (const inv of invoices) {
    for (const gid of inv.goodsReceiptIds) {
      if (!invoiceByGrn.has(gid)) invoiceByGrn.set(gid, inv)
    }
  }

  const rows: MatchRow[] = []

  for (const grn of PurchaseReceivingService.list()) {
    if (grn.status !== "POSTED") continue
    const inv = invoiceByGrn.get(grn.id) ?? null
    const po = grn.purchaseOrderId
      ? PurchaseOrderService.getById(grn.purchaseOrderId)
      : null

    const receivedQty = grn.lines.reduce((s, l) => s + l.quantity, 0)
    const receivedPaisa = grn.lines.reduce((s, l) => {
      if (l.unitCostRupees == null) return s
      return s + Math.round(l.quantity * l.unitCostRupees * 100)
    }, 0)

    const billedLines = inv
      ? inv.lines.filter((l) => l.goodsReceiptId === grn.id)
      : []
    const billedQty = billedLines.reduce((s, l) => s + l.quantity, 0)
    const billedPaisa = billedLines.reduce((s, l) => s + l.lineTotalPaisa, 0)

    const returned = PurchaseReturnService.returnedQtyBySkuForGrn(grn.id)
    const returnedQty = Object.values(returned).reduce((s, n) => s + n, 0)

    const variancePaisa = billedPaisa - receivedPaisa
    let status: MatchStatus = "Matched"
    if (!inv) status = "Unbilled"
    else if (Math.abs(variancePaisa) > 0 || billedQty !== receivedQty) {
      status = "Variance"
    }

    rows.push({
      key: grn.id,
      supplierName: grn.supplierName,
      poNumber: po?.poNumber ?? null,
      grnNumber: grn.grnNumber,
      invoiceNumber: inv?.invoiceNumber ?? null,
      receivedQty,
      billedQty,
      returnedQty,
      receivedPaisa,
      billedPaisa,
      variancePaisa,
      status,
    })
  }

  // Open POs with remaining qty and no GRN row yet.
  for (const po of PurchaseOrderService.list()) {
    if (po.status !== "ISSUED" && po.status !== "PARTIAL") continue
    const open = po.lines.reduce((s, l) => s + remainingQty(l), 0)
    if (open <= 0) continue
    const hasGrn = PurchaseReceivingService.list().some(
      (g) => g.purchaseOrderId === po.id && g.status === "POSTED"
    )
    if (hasGrn) continue
    rows.push({
      key: `po-${po.id}`,
      supplierName: po.supplierName,
      poNumber: po.poNumber,
      grnNumber: null,
      invoiceNumber: null,
      receivedQty: 0,
      billedQty: 0,
      returnedQty: 0,
      receivedPaisa: 0,
      billedPaisa: 0,
      variancePaisa: 0,
      status: "Open PO",
    })
  }

  return rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName))
}

function buildSpendBySupplier(): SupplierSpendRow[] {
  const map = new Map<string, SupplierSpendRow>()

  for (const s of SupplierService.list({ includeInactive: true })) {
    map.set(s.id, {
      supplierId: s.id,
      supplierName: s.name,
      invoiceCount: 0,
      billedPaisa: 0,
      paidPaisa: 0,
      creditedPaisa: 0,
      remainingPaisa: 0,
      returnPaisa: 0,
    })
  }

  for (const inv of SupplierInvoiceService.list()) {
    if (
      inv.status !== "POSTED" &&
      inv.status !== "PARTIAL" &&
      inv.status !== "PAID"
    ) {
      continue
    }
    const row =
      map.get(inv.supplierId) ||
      ({
        supplierId: inv.supplierId,
        supplierName: inv.supplierName,
        invoiceCount: 0,
        billedPaisa: 0,
        paidPaisa: 0,
        creditedPaisa: 0,
        remainingPaisa: 0,
        returnPaisa: 0,
      } satisfies SupplierSpendRow)
    row.invoiceCount += 1
    row.billedPaisa += inv.totalPaisa
    row.paidPaisa += inv.amountPaidPaisa
    row.creditedPaisa += inv.amountCreditedPaisa || 0
    row.remainingPaisa += SupplierInvoiceService.remainingPayablePaisa(inv)
    map.set(inv.supplierId, row)
  }

  for (const ret of PurchaseReturnService.list()) {
    if (ret.status !== "POSTED") continue
    const row = map.get(ret.supplierId)
    if (!row) continue
    row.returnPaisa += ret.totalPaisa
  }

  return [...map.values()]
    .filter(
      (r) =>
        r.invoiceCount > 0 || r.returnPaisa > 0 || r.billedPaisa > 0
    )
    .sort((a, b) => b.billedPaisa - a.billedPaisa)
}
