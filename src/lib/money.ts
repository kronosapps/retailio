/** Integer minor units. 1 rupee = 100 paisa. */
export type Paisa = number

/** Major units for display / authoring (may include paise as decimals). */
export type Rupees = number

export const PAISA_PER_RUPEE = 100

/** Convert rupees (JSON / UI) → integer paisa for calculations. */
export function rupeesToPaisa(rupees: Rupees): Paisa {
  if (!Number.isFinite(rupees)) return 0
  return Math.round(rupees * PAISA_PER_RUPEE)
}

/** Convert paisa → rupees for display or UI-facing values. */
export function paisaToRupees(paisa: Paisa): Rupees {
  if (!Number.isFinite(paisa)) return 0
  return paisa / PAISA_PER_RUPEE
}

/** Round a floating paisa-scale value to the nearest paisa. */
export function roundPaisa(value: number): Paisa {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

/** Apply a percent to a paisa amount; result rounded to nearest paisa. */
export function percentOfPaisa(amountPaisa: Paisa, percent: number): Paisa {
  if (!Number.isFinite(amountPaisa) || !Number.isFinite(percent)) return 0
  if (amountPaisa <= 0 || percent <= 0) return 0
  return roundPaisa((amountPaisa * percent) / 100)
}

/** Format paisa as INR for the UI (always shown in rupees, down to paise). */
export function formatMoney(paisa: Paisa) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paisaToRupees(paisa))
}
