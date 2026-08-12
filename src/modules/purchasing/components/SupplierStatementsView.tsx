import { useMemo, useState } from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/money"
import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"
import {
  SupplierInvoiceService,
  SupplierPaymentService,
} from "@/modules/purchasing"
import { SupplierService } from "@/modules/supplier"
import { cn } from "@/lib/utils"

type StatementRow = {
  date: string
  sortKey: string
  type: "Invoice" | "Payment"
  reference: string
  debitPaisa: number
  creditPaisa: number
  balancePaisa: number
}

/**
 * Purchasing → Supplier Statements — opening AP + invoices − payments.
 */
export function SupplierStatementsView() {
  const [supplierId, setSupplierId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suppliers = useMemo(
    () => SupplierService.list({ includeInactive: true }),
    []
  )

  const activeSupplierId = supplierId || suppliers[0]?.id || ""

  const statement = useMemo(() => {
    if (!activeSupplierId) {
      return { rows: [] as StatementRow[], closingPaisa: 0, supplierName: "" }
    }
    const supplier = SupplierService.getById(activeSupplierId)
    const invoices = SupplierInvoiceService.list().filter(
      (i) =>
        i.supplierId === activeSupplierId &&
        (i.status === "POSTED" ||
          i.status === "PARTIAL" ||
          i.status === "PAID")
    )
    const payments = SupplierPaymentService.listForSupplier(activeSupplierId)

    const events: Array<Omit<StatementRow, "balancePaisa">> = []
    for (const inv of invoices) {
      events.push({
        date: (inv.postedAt || inv.billDate).slice(0, 10),
        sortKey: inv.postedAt || inv.createdAt,
        type: "Invoice",
        reference: inv.invoiceNumber,
        debitPaisa: inv.totalPaisa,
        creditPaisa: 0,
      })
    }
    for (const pay of payments) {
      events.push({
        date: pay.paidAt.slice(0, 10),
        sortKey: pay.paidAt,
        type: "Payment",
        reference: pay.paymentNumber,
        debitPaisa: 0,
        creditPaisa: pay.amountPaisa,
      })
    }
    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

    let balance = 0
    const rows: StatementRow[] = events.map((e) => {
      balance += e.debitPaisa - e.creditPaisa
      return { ...e, balancePaisa: balance }
    })

    return {
      rows,
      closingPaisa: balance,
      supplierName: supplier?.name || "",
    }
  }, [activeSupplierId])

  async function onExport() {
    setError(null)
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        reportType: "utility" as const,
        title: `Supplier Statement — ${statement.supplierName}`,
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
        sheets: [
          {
            name: "Statement",
            columns: [
              "Date",
              "Type",
              "Reference",
              "Debit",
              "Credit",
              "Balance",
            ],
            rows: [
              ...statement.rows.map((r) => [
                r.date,
                r.type,
                r.reference,
                formatMoney(r.debitPaisa),
                formatMoney(r.creditPaisa),
                formatMoney(r.balancePaisa),
              ]),
              [
                "",
                "",
                "Closing AP",
                "",
                "",
                formatMoney(statement.closingPaisa),
              ],
            ],
          },
        ],
      }
      await ExcelReportExporter.download(
        payload,
        `supplier-statement-${activeSupplierId || "all"}.xlsx`
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not export statement."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Supplier Statements</h2>
          <p className="text-sm text-muted-foreground">
            Posted invoices increase AP; payments reduce it. Closing balance is
            amount still payable.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !activeSupplierId || statement.rows.length === 0}
          onClick={() => void onExport()}
        >
          <Download className="size-4" />
          {busy ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      <div className="max-w-sm space-y-1">
        <Label htmlFor="stmt-supplier">Supplier</Label>
        <select
          id="stmt-supplier"
          className={cn(
            "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          )}
          value={activeSupplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        Closing AP:{" "}
        <span className="font-semibold tabular-nums">
          {formatMoney(statement.closingPaisa)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Debit</th>
              <th className="px-3 py-2">Credit</th>
              <th className="px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.rows.map((r, i) => (
              <tr key={`${r.reference}-${i}`} className="border-b last:border-0">
                <td className="px-3 py-2 text-xs">{r.date}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.debitPaisa ? formatMoney(r.debitPaisa) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.creditPaisa ? formatMoney(r.creditPaisa) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatMoney(r.balancePaisa)}
                </td>
              </tr>
            ))}
            {statement.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  No posted invoices or payments for this supplier.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
