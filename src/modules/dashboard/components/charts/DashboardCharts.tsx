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
  "#0d9488",
  "#0284c7",
]

function ChartShell({
  title,
  description,
  children,
  accentClass = "border-border/70 bg-card",
}: {
  title: string
  description?: string
  children: ReactNode
  accentClass?: string
}) {
  return (
    <Card
      size="sm"
      className={`min-h-[280px] overflow-hidden shadow-none ${accentClass}`}
    >
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
    <ChartShell
      title="Revenue trend"
      description="Paid sales in period"
      accentClass="border-teal-200/70 bg-gradient-to-b from-teal-50/80 to-card dark:border-teal-800/50 dark:from-teal-950/30"
    >
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
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function PaymentMethodsChart({ data }: { data: NamedValue[] }) {
  return (
    <ChartShell
      title="Payment methods"
      description="Share of paid revenue"
      accentClass="border-sky-200/70 bg-gradient-to-b from-sky-50/80 to-card dark:border-sky-800/50 dark:from-sky-950/30"
    >
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
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
    <ChartShell
      title="Category sales"
      description="Revenue by category (₹)"
      accentClass="border-amber-200/70 bg-gradient-to-b from-amber-50/70 to-card dark:border-amber-800/50 dark:from-amber-950/25"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Bar
            dataKey="value"
            name="Revenue (₹)"
            fill="var(--color-chart-2)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function TopProductsChart({ data }: { data: NamedValue[] }) {
  return (
    <ChartShell
      title="Top selling products"
      description="Units sold"
      accentClass="border-emerald-200/70 bg-gradient-to-b from-emerald-50/70 to-card dark:border-emerald-800/50 dark:from-emerald-950/25"
    >
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
          <Bar
            dataKey="value"
            name="Qty"
            fill="var(--color-chart-3)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

export function HourlySalesChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartShell
      title="Hourly sales"
      description="Revenue by hour (₹)"
      accentClass="border-cyan-200/70 bg-gradient-to-b from-cyan-50/70 to-card dark:border-cyan-800/50 dark:from-cyan-950/25"
    >
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
            fillOpacity={0.3}
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
