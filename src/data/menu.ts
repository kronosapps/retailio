import menuData from "./menu.json"
import { assetUrl } from "@/lib/asset-url"

export type MenuWeight = {
  weight: string
  price: number
  color: string
  image?: string
}

export type MenuItem = {
  id: string
  name: string
  category: string
  color: string
  image?: string
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
  image?: string
}

export type MenuData = {
  categories: string[]
  items: MenuItem[]
}

function normalizeWeights(
  raw: unknown,
  fallbackColor: string,
  fallbackImage?: string
): MenuWeight[] {
  if (!Array.isArray(raw)) return []

  const weights: MenuWeight[] = []
  for (const entry of raw) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as MenuWeight).weight !== "string" ||
      typeof (entry as MenuWeight).price !== "number"
    ) {
      continue
    }

    const color =
      typeof (entry as MenuWeight).color === "string" &&
      (entry as MenuWeight).color
        ? (entry as MenuWeight).color
        : fallbackColor

    const imageRaw =
      typeof (entry as { image?: unknown }).image === "string" &&
      (entry as { image: string }).image
        ? (entry as { image: string }).image
        : fallbackImage

    const weight: MenuWeight = {
      weight: (entry as MenuWeight).weight,
      price: (entry as MenuWeight).price,
      color,
    }
    if (imageRaw) weight.image = assetUrl(imageRaw)
    weights.push(weight)
  }
  return weights
}

function normalizeMenuData(raw: unknown): MenuData {
  const data = raw as Partial<MenuData> | null
  const categories = Array.isArray(data?.categories)
    ? data.categories.filter((value): value is string => typeof value === "string")
    : []

  const items: MenuItem[] = []
  if (Array.isArray(data?.items)) {
    for (const item of data.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.category !== "string"
      ) {
        continue
      }

      const itemColor = typeof item.color === "string" ? item.color : "#e5e5e5"
      const itemImageRaw =
        typeof item.image === "string" ? item.image : undefined
      const itemImage = itemImageRaw ? assetUrl(itemImageRaw) : undefined
      // Pass raw fallback into weights so each weight applies assetUrl once
      const weights = normalizeWeights(item.weights, itemColor, itemImageRaw)
      if (weights.length === 0) continue

      const normalized: MenuItem = {
        id: item.id,
        name: item.name,
        category: item.category,
        color: itemColor,
        weights,
      }
      if (itemImage) normalized.image = itemImage
      items.push(normalized)
    }
  }

  return { categories, items }
}

export const menuCatalog = normalizeMenuData(menuData)

export const MENU_CATEGORIES = ["All", ...menuCatalog.categories] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

export const MENU_ITEMS = menuCatalog.items

export function getMenuImageUrls(): string[] {
  const urls = new Set<string>()
  for (const item of MENU_ITEMS) {
    if (item.image) urls.add(item.image)
    for (const weight of item.weights) {
      if (weight.image) urls.add(weight.image)
    }
  }
  return [...urls]
}

export function getMenuItemsByCategory(category: MenuCategory): MenuItem[] {
  if (category === "All") return MENU_ITEMS
  return MENU_ITEMS.filter((item) => item.category === category)
}

export function toMenuVariant(
  item: MenuItem,
  weightOption: MenuWeight
): MenuVariant {
  const image = weightOption.image || item.image
  const variant: MenuVariant = {
    id: `${item.id}__${weightOption.weight}`,
    itemId: item.id,
    name: item.name,
    weight: weightOption.weight,
    price: weightOption.price,
    category: item.category,
    color: weightOption.color || item.color,
  }
  if (image) variant.image = image
  return variant
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
}
