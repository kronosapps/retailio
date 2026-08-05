/**
 * POS visual metadata for catalog productIds.
 * Products DB has no images/colors — this map keeps the touch UI branded.
 */
import { assetUrl } from "@/lib/asset-url"

export type ProductDisplay = {
  color: string
  image?: string
  /** Optional per-pack-size tile colors */
  packColors?: Record<number, string>
}

const BY_PRODUCT_ID: Record<string, ProductDisplay> = {
  "PID-MH-BL-001": {
    color: "#FDE68A",
    image: "/menu/bellam-halwa-main.png",
    packColors: {
      100: "#FED7AA",
      250: "#FED7EB",
      500: "#FED7EF",
      1000: "#FED7EE",
    },
  },
  "PID-MH-HY-002": {
    color: "#FED7AA",
    image: "/menu/honey-halwa.png",
    packColors: {
      100: "#FDE68A",
      250: "#FCD34D",
      500: "#FBBF24",
      1000: "#F59E0B",
    },
  },
  "PID-MH-MN-003": {
    color: "#FDBA74",
    image: "/menu/multi-nuts-halwa.png",
    packColors: {
      100: "#FED7AA",
      250: "#FDBA74",
      500: "#FB923C",
      1000: "#F97316",
    },
  },
  "PID-HR-BL-004": {
    color: "#FED7AA",
    image: "/menu/halwa-rolls.png",
  },
  "PID-HR-HY-005": {
    color: "#FDE68A",
    image: "/menu/halwa-rolls.png",
  },
  "PID-HT-MX-006": { color: "#F97316" },
  "PID-HT-KR-007": { color: "#EA580C" },
  "PID-HT-RP-008": { color: "#C2410C" },
  "PID-HT-RJ-009": { color: "#9A3412" },
  "PID-HT-KP-010": { color: "#B45309" },
  "PID-HT-KT-011": { color: "#D97706" },
  "PID-HT-KM-012": { color: "#F59E0B" },
  "PID-ST-AP-013": {
    color: "#FCD34D",
    image: "/menu/putharekulu.png",
  },
  "PID-ST-AP-023": {
    color: "#FDE68A",
    image: "/menu/putharekulu.png",
  },
  "PID-HY-RH-014": { color: "#FBBF24" },
  "PID-LD-DF-015": {
    color: "#FEF08A",
    image: "/menu/dry-fruit-laddu.png",
  },
  "PID-LD-DF-022": {
    color: "#FEF08A",
    image: "/menu/dry-fruit-laddu.png",
  },
  "PID-LD-RL-016": { color: "#EAB308" },
  "PID-LD-SD-017": { color: "#CA8A04" },
  "PID-CM-RG-018": {
    color: "#D6D3D1",
    image: "/menu/regular-combo.png",
  },
  "PID-CM-TR-019": {
    color: "#D6D3D1",
    image: "/menu/trio-combo.png",
  },
  "PID-CM-PM-020": {
    color: "#D6D3D1",
    image: "/menu/premium-combo.png",
  },
  "PID-CM-FM-021": {
    color: "#D6D3D1",
    image: "/menu/family-combo.png",
  },
}

const CATEGORY_FALLBACK: Record<string, string> = {
  "Madugula Halwa": "#FDE68A",
  "Halwa Rolls": "#FED7AA",
  Hot: "#F97316",
  Sweet: "#FCD34D",
  Honey: "#FBBF24",
  Laddu: "#FEF08A",
  Combos: "#D6D3D1",
}

export function getProductDisplay(
  productId: string,
  category: string
): ProductDisplay {
  const mapped = BY_PRODUCT_ID[productId]
  if (mapped) {
    return {
      ...mapped,
      image: mapped.image ? assetUrl(mapped.image) : undefined,
    }
  }
  return {
    color: CATEGORY_FALLBACK[category] || "#78716c",
  }
}

export function getProductDisplayImageUrls(): string[] {
  const urls = new Set<string>()
  for (const display of Object.values(BY_PRODUCT_ID)) {
    if (display.image) urls.add(assetUrl(display.image))
  }
  return [...urls]
}
