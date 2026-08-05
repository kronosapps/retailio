import type { ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { NamedValue, SeriesPoint } from "../../types/dashboard"

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#78716c",
  "#a8a29e",
]

function ChartShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card size="sm" className="min-h-[280px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="h-[220px] pt-0">{children}</CardContent>
    </Card>
  )
}

export function RevenueTrendChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartShell title="Revenue trend" description="Paid sales in period">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            name="Revenue (₹)"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function PaymentMethodsChart({ data }: { data: NamedValue[] }) {
  return (
    <ChartShell title="Payment methods" description="Share of paid revenue">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function CategorySalesChart({ data }: { data: NamedValue[] }) {
  return (
    <ChartShell title="Category sales" description="Revenue by category (₹)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Bar dataKey="value" name="Revenue (₹)" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function TopProductsChart({ data }: { data: NamedValue[] }) {
  return (
    <ChartShell title="Top selling products" description="Units sold">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 10 }}
          />
          <Tooltip />
          <Bar dataKey="value" name="Qty" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function HourlySalesChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartShell title="Hourly sales" description="Revenue by hour (₹)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="value"
            name="Revenue (₹)"
            stroke="var(--color-chart-4)"
            fill="var(--color-chart-4)"
            fillOpacity={0.25}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function ChartSkeleton() {
  return (
    <Card size="sm" className="min-h-[280px] animate-pulse">
      <CardHeader>
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-[200px] rounded-lg bg-muted/60" />
      </CardContent>
    </Card>
  )
}
