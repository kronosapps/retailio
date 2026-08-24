/**
 * Dashboard accent palette — semantic colors for KPI cards and panels.
 * Keep hues distinct; avoid purple / cream–terracotta AI clichés.
 */
export type DashboardAccent =
  | "teal"
  | "sky"
  | "emerald"
  | "amber"
  | "violet"
  | "rose"
  | "slate"
  | "cyan"

export const DASHBOARD_ACCENT: Record<
  DashboardAccent,
  {
    card: string
    iconWrap: string
    icon: string
    label: string
    value: string
  }
> = {
  teal: {
    card: "border-teal-200/80 bg-gradient-to-br from-teal-50 to-white dark:border-teal-800/60 dark:from-teal-950/40 dark:to-card",
    iconWrap: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300",
    icon: "text-teal-600 dark:text-teal-400",
    label: "text-teal-800/70 dark:text-teal-300/80",
    value: "text-teal-950 dark:text-teal-50",
  },
  sky: {
    card: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white dark:border-sky-800/60 dark:from-sky-950/40 dark:to-card",
    iconWrap: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
    icon: "text-sky-600 dark:text-sky-400",
    label: "text-sky-800/70 dark:text-sky-300/80",
    value: "text-sky-950 dark:text-sky-50",
  },
  emerald: {
    card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-800/60 dark:from-emerald-950/40 dark:to-card",
    iconWrap:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
    label: "text-emerald-800/70 dark:text-emerald-300/80",
    value: "text-emerald-950 dark:text-emerald-50",
  },
  amber: {
    card: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white dark:border-amber-800/60 dark:from-amber-950/40 dark:to-card",
    iconWrap:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
    label: "text-amber-900/70 dark:text-amber-300/80",
    value: "text-amber-950 dark:text-amber-50",
  },
  // Soft indigo — used sparingly for customers (not neon purple)
  violet: {
    card: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-800/60 dark:from-indigo-950/40 dark:to-card",
    iconWrap:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    icon: "text-indigo-600 dark:text-indigo-400",
    label: "text-indigo-800/70 dark:text-indigo-300/80",
    value: "text-indigo-950 dark:text-indigo-50",
  },
  rose: {
    card: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-white dark:border-rose-800/60 dark:from-rose-950/40 dark:to-card",
    iconWrap: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    icon: "text-rose-600 dark:text-rose-400",
    label: "text-rose-800/70 dark:text-rose-300/80",
    value: "text-rose-950 dark:text-rose-50",
  },
  slate: {
    card: "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white dark:border-slate-700/60 dark:from-slate-900/40 dark:to-card",
    iconWrap:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    icon: "text-slate-600 dark:text-slate-400",
    label: "text-slate-700/80 dark:text-slate-300/80",
    value: "text-slate-950 dark:text-slate-50",
  },
  cyan: {
    card: "border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white dark:border-cyan-800/60 dark:from-cyan-950/40 dark:to-card",
    iconWrap: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300",
    icon: "text-cyan-600 dark:text-cyan-400",
    label: "text-cyan-800/70 dark:text-cyan-300/80",
    value: "text-cyan-950 dark:text-cyan-50",
  },
}
