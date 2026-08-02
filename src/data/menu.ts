import menuData from "./menu.json"

export type MenuWeight = {
  weight: string
  price: number
}

export type MenuItem = {
  id: string
  name: string
  category: string
  color: string
  weights: MenuWeight[]
}

/** A specific weight selection sold on POS / cart */
export type MenuVariant = {
  id: string
  itemId: string
  name: string
  weight: string
  price: number
  category: string
  color: string
}

export type MenuData = {
  categories: string[]
  items: MenuItem[]
}

function normalizeWeights(raw: unknown): MenuWeight[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is MenuWeight =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as MenuWeight).weight === "string" &&
      typeof (entry as MenuWeight).price === "number"
  )
}

function normalizeMenuData(raw: unknown): MenuData {
  const data = raw as Partial<MenuData> | null
  const categories = Array.isArray(data?.categories)
    ? data.categories.filter((value): value is string => typeof value === "string")
    : []
  const items = Array.isArray(data?.items)
    ? data.items
        .map((item) => {
          if (
            !item ||
            typeof item.id !== "string" ||
            typeof item.name !== "string" ||
            typeof item.category !== "string"
          ) {
            return null
          }
          const weights = normalizeWeights(item.weights)
          if (weights.length === 0) return null
          return {
            id: item.id,
            name: item.name,
            category: item.category,
            color: typeof item.color === "string" ? item.color : "#e5e5e5",
            weights,
          } satisfies MenuItem
        })
        .filter((item): item is MenuItem => item !== null)
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

export function toMenuVariant(
  item: MenuItem,
  weightOption: MenuWeight
): MenuVariant {
  return {
    id: `${item.id}__${weightOption.weight}`,
    itemId: item.id,
    name: item.name,
    weight: weightOption.weight,
    price: weightOption.price,
    category: item.category,
    color: item.color,
  }
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}
