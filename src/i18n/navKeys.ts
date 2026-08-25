/** Path → i18n key for sidebar / POS nav labels. */
export const NAV_LABEL_KEY_BY_PATH: Record<string, string> = {
  "/": "nav.dashboard",
  "/pos": "nav.pos",
  "/shifts": "nav.shifts",
  "/day-ops": "nav.dayOps",
  "/returns": "nav.returns",
  "/inventory": "nav.inventory",
  "/purchasing": "nav.purchasing",
  "/customers": "nav.customers",
  "/transactions": "nav.transactions",
  "/reports": "nav.reports",
  "/utilities": "nav.utilities",
  "/banking": "nav.banking",
  "/settings": "nav.settings",
  "/options": "nav.settings",
  "/staff": "nav.staff",
}

export function navLabelKey(path: string): string {
  return NAV_LABEL_KEY_BY_PATH[path] ?? path
}
