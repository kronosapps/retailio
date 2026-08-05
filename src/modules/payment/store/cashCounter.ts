/**
 * Daily cash receipt counter (reactive).
 * Starts at 1 each calendar day (local time) and increments until midnight.
 * Subscribers update instantly when a slip is allocated — no page refresh.
 */

const STORAGE_KEY = "retailos.cash.counter.v1"

export type CashReceiptPeek = {
  dateKey: string
  sequence: number
  cashReceiptId: string
}

type CashCounterStore = {
  version: 1
  /** YYYYMMDD in local time */
  dateKey: string
  /** Next number to assign (1-based) */
  nextSequence: number
}

const listeners = new Set<() => void>()

/** Cached snapshot for useSyncExternalStore (stable when unchanged). */
let snapshot: CashReceiptPeek | null = null

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(date = new Date()): CashCounterStore {
  return {
    version: 1,
    dateKey: todayDateKey(date),
    nextSequence: 1,
  }
}

function peekFromStore(store: CashCounterStore): CashReceiptPeek {
  return {
    dateKey: store.dateKey,
    sequence: store.nextSequence,
    cashReceiptId: formatCashReceiptId(store.dateKey, store.nextSequence),
  }
}

function readStore(): CashCounterStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<CashCounterStore>
    if (
      typeof parsed.dateKey !== "string" ||
      typeof parsed.nextSequence !== "number"
    ) {
      return emptyStore()
    }
    return {
      version: 1,
      dateKey: parsed.dateKey,
      nextSequence: Math.max(1, Math.floor(parsed.nextSequence)),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CashCounterStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function ensureToday(
  store: CashCounterStore,
  date = new Date()
): CashCounterStore {
  const today = todayDateKey(date)
  if (store.dateKey === today) return store
  return emptyStore(date)
}

function computePeek(date = new Date()): CashReceiptPeek {
  let store = ensureToday(readStore(), date)
  const persisted = readStore()
  // Persist day rollover so allocate/peek stay aligned
  if (persisted.dateKey !== store.dateKey) {
    writeStore(store)
  }
  return peekFromStore(store)
}

function refreshSnapshot(date = new Date()): CashReceiptPeek {
  const next = computePeek(date)
  if (
    snapshot &&
    snapshot.dateKey === next.dateKey &&
    snapshot.sequence === next.sequence &&
    snapshot.cashReceiptId === next.cashReceiptId
  ) {
    return snapshot
  }
  snapshot = next
  return snapshot
}

function emit() {
  // Force snapshot rebuild even if we just wrote
  snapshot = null
  refreshSnapshot()
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) {
    emit()
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", onStorage)
}

/** Subscribe to cash-counter changes (useSyncExternalStore). */
export function subscribeCashCounter(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Stable snapshot for useSyncExternalStore. */
export function getCashCounterSnapshot(): CashReceiptPeek {
  return refreshSnapshot()
}

/** Server/SSR fallback snapshot. */
export function getCashCounterServerSnapshot(): CashReceiptPeek {
  return {
    dateKey: todayDateKey(),
    sequence: 1,
    cashReceiptId: formatCashReceiptId(todayDateKey(), 1),
  }
}

/** Peek next cash number without consuming it. */
export function peekNextCashReceipt(date = new Date()): CashReceiptPeek {
  return refreshSnapshot(date)
}

/** Allocate and persist the next cash receipt number for today. */
export function allocateCashReceipt(date = new Date()): CashReceiptPeek {
  const store = ensureToday(readStore(), date)
  const sequence = store.nextSequence
  const cashReceiptId = formatCashReceiptId(store.dateKey, sequence)

  writeStore({
    version: 1,
    dateKey: store.dateKey,
    nextSequence: sequence + 1,
  })

  // Notify POS / payment UI immediately (same tab + via storage in other tabs)
  emit()

  return {
    dateKey: store.dateKey,
    sequence,
    cashReceiptId,
  }
}

export function formatCashReceiptId(dateKey: string, sequence: number): string {
  return `CASH-${dateKey}-${String(sequence).padStart(4, "0")}`
}
