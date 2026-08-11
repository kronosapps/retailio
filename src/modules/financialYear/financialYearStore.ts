import type { FinancialYear } from "./types"

const STORAGE_KEY = "retailos.financialYears.v1"

type Store = {
  version: 1
  items: FinancialYear[]
  activeId: string | null
}

function empty(): Store {
  return { version: 1, items: [], activeId: null }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? (parsed.items as FinancialYear[]) : [],
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listFinancialYears(): FinancialYear[] {
  return [...read().items].sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  )
}

export function getActiveFinancialYearId(): string | null {
  return read().activeId
}

export function upsertFinancialYear(fy: FinancialYear, makeActive = false) {
  const store = read()
  const idx = store.items.findIndex((i) => i.id === fy.id)
  if (idx >= 0) store.items[idx] = fy
  else store.items.push(fy)
  if (makeActive) {
    store.activeId = fy.id
    store.items = store.items.map((i) =>
      i.id === fy.id
        ? { ...i, status: "active" }
        : i.status === "active"
          ? { ...i, status: "closed" }
          : i
    )
  }
  write(store)
  return fy
}

export function setActiveFinancialYearId(id: string) {
  const store = read()
  if (!store.items.some((i) => i.id === id)) {
    throw new Error("Financial year not found.")
  }
  store.activeId = id
  store.items = store.items.map((i) =>
    i.id === id
      ? { ...i, status: "active", updatedAt: new Date().toISOString() }
      : i.status === "active"
        ? { ...i, status: "closed", updatedAt: new Date().toISOString() }
        : i
  )
  write(store)
}

export function replaceFinancialYears(
  items: FinancialYear[],
  activeId: string | null
) {
  write({ version: 1, items, activeId })
}
