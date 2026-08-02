import menuData from "./menu.json"

export type MenuItem = {
  id: string
  name: string
  price: number
  category: string
  color: string
}

export type MenuData = {
  categories: string[]
  items: MenuItem[]
}

function normalizeMenuData(raw: unknown): MenuData {
  const data = raw as Partial<MenuData> | null
  const categories = Array.isArray(data?.categories)
    ? data.categories.filter((value): value is string => typeof value === "string")
    : []
  const items = Array.isArray(data?.items)
    ? data.items.filter(
        (item): item is MenuItem =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.category === "string" &&
          typeof item.price === "number"
      )
    : []

  return { categories, items }
}

export const menuCatalog = normalizeMenuData(menuData)

export const MENU_CATEGORIES = ["All", ...menuCatalog.categories] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

export const MENU_ITEMS = menuCatalog.items

export function getMenuItemsByCategory(category: MenuCategory): MenuItem[] {
  if (category === "All") return MENU_ITEMS
  return MENU_ITEMS.filter((item) => item.category === category)
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}
