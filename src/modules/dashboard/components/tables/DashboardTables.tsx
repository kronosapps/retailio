import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatMoney } from "@/lib/money"
import type {
  RecentSaleRow,
  StockRow,
  TopProductRow,
} from "../../types/dashboard"

function TableShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">{children}</CardContent>
    </Card>
  )
}

export function TopProductsTable({ rows }: { rows: TopProductRow[] }) {
  return (
    <TableShell title="Top selling products" description="By quantity sold">
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-2 font-medium">Product</th>
              <th className="py-2 pr-2 font-medium">Qty</th>
              <th className="py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.sku}-${row.weight}`} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  <div className="font-medium">
                    {row.name}{" "}
                    <span className="text-muted-foreground">{row.weight}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{row.sku}</div>
                </td>
                <td className="py-2 pr-2 tabular-nums">{row.qtySold}</td>
                <td className="py-2 tabular-nums">
                  {formatMoney(row.revenuePaisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  )
}

export function RecentSalesTable({
  rows,
  onRefund,
}: {
  rows: RecentSaleRow[]
  onRefund?: (row: RecentSaleRow) => void
}) {
  return (
    <TableShell title="Recent sales" description="Latest paid invoices">
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-2 font-medium">Invoice</th>
              <th className="py-2 pr-2 font-medium">Customer</th>
              <th className="py-2 pr-2 font-medium">Method</th>
              <th className="py-2 pr-2 font-medium">Total</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.invoiceId} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  <div className="font-mono text-xs">{row.invoiceId}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString("en-IN")}
                  </div>
                </td>
                <td className="py-2 pr-2">{row.customerName}</td>
                <td className="py-2 pr-2">{row.paymentMethod || "—"}</td>
                <td className="py-2 pr-2 tabular-nums">
                  {formatMoney(row.totalPaisa)}
                </td>
                <td className="py-2 text-right">
                  {row.canRefund && onRefund ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRefund(row)}
                    >
                      Refund
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  )
}

export function StockTable({
  title,
  rows,
}: {
  title: string
  rows: StockRow[]
}) {
  return (
    <TableShell title={title}>
      {rows.length === 0 ? (
        <Empty text="None right now" />
      ) : (
        <table className="w-full min-w-[360px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="py-2 font-medium">Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.sku || row.category || "—"}
                  </div>
                </td>
                <td className="py-2 tabular-nums">
                  {row.quantity} {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  )
}

function Empty({ text = "No data for this period" }: { text?: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{text}</p>
}

export function TableSkeleton() {
  return (
    <Card size="sm" className="animate-pulse">
      <CardHeader>
        <div className="h-4 w-36 rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-8 rounded bg-muted" />
        <div className="h-8 rounded bg-muted" />
        <div className="h-8 rounded bg-muted" />
      </CardContent>
    </Card>
  )
}
