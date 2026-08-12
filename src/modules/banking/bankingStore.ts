import { env } from "@/core/config/env"
import { rupeesToPaisa, type Paisa } from "@/lib/money"
import { createId } from "@/utils/id"

import type {
  BankingChannel,
  BankingEntryDirection,
  BankingEntrySource,
  BankingLedgerEntry,
  BankingOpeningBalances,
} from "./types"

const STORAGE_KEY = "retailos.banking.v1"

type BankingStore = {
  version: 1
  opening: BankingOpeningBalances
  entries: BankingLedgerEntry[]
  seededMock: boolean
}

function defaultOpening(): BankingOpeningBalances {
  return {
    cashPaisa: rupeesToPaisa(env.banking.openingCashRupees || 0),
    upiPaisa: rupeesToPaisa(env.banking.openingUpiRupees || 0),
    updatedAt: null,
  }
}

function mockEntries(storeId: string | null): BankingLedgerEntry[] {
  const day = new Date()
  day.setHours(10, 15, 0, 0)
  const t1 = day.toISOString()
  day.setHours(12, 40, 0, 0)
  const t2 = day.toISOString()
  day.setHours(16, 5, 0, 0)
  const t3 = day.toISOString()

  return [
    {
      id: createId("bnk"),
      createdAt: t1,
      channel: "cash",
      direction: "in",
      amountPaisa: rupeesToPaisa(850),
      source: "mock",
      reference: "MOCK-CASH-001",
      note: "Mock cash sale",
      storeId,
    },
    {
      id: createId("bnk"),
      createdAt: t2,
      channel: "upi",
      direction: "in",
      amountPaisa: rupeesToPaisa(1250),
      source: "mock",
      reference: "MOCK-UPI-001",
      note: "Mock UPI sale",
      storeId,
    },
    {
      id: createId("bnk"),
      createdAt: t3,
      channel: "cash",
      direction: "out",
      amountPaisa: rupeesToPaisa(200),
      source: "mock",
      reference: "MOCK-REF-001",
      note: "Mock cash refund",
      storeId,
    },
  ]
}

function emptyStore(): BankingStore {
  return {
    version: 1,
    opening: defaultOpening(),
    entries: [],
    seededMock: false,
  }
}

function readStore(): BankingStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<BankingStore>
    if (!parsed || parsed.version !== 1) return emptyStore()
    return {
      version: 1,
      opening: parsed.opening ?? defaultOpening(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      seededMock: Boolean(parsed.seededMock),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: BankingStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** Ensure mock demo rows exist once per browser (editable ledger after that). */
export function ensureBankingSeeded(storeId: string | null = env.storeId) {
  const store = readStore()
  if (store.seededMock) return store
  const next: BankingStore = {
    ...store,
    opening: store.opening.updatedAt ? store.opening : defaultOpening(),
    entries: [...mockEntries(storeId), ...store.entries],
    seededMock: true,
  }
  writeStore(next)
  return next
}

export function getBankingStore(): BankingStore {
  return ensureBankingSeeded()
}

export function setOpeningBalancesLocal(
  cashPaisa: Paisa,
  upiPaisa: Paisa
): BankingOpeningBalances {
  const store = ensureBankingSeeded()
  const opening: BankingOpeningBalances = {
    cashPaisa: Math.max(0, cashPaisa),
    upiPaisa: Math.max(0, upiPaisa),
    updatedAt: new Date().toISOString(),
  }
  writeStore({ ...store, opening })
  return opening
}

export function appendLedgerEntry(input: {
  channel: BankingChannel
  direction: BankingEntryDirection
  amountPaisa: Paisa
  source: BankingEntrySource
  reference?: string | null
  note: string
  storeId?: string | null
  createdAt?: string
}): BankingLedgerEntry {
  const store = ensureBankingSeeded()
  const amount = Math.max(0, Math.round(input.amountPaisa))
  if (amount <= 0) {
    throw new Error("Amount must be greater than zero.")
  }

  // Idempotent for sale/refund/supplier_payment when same reference already recorded
  if (
    input.reference &&
    (input.source === "sale" ||
      input.source === "refund" ||
      input.source === "supplier_payment")
  ) {
    const existing = store.entries.find(
      (e) => e.reference === input.reference && e.source === input.source
    )
    if (existing) return existing
  }

  const entry: BankingLedgerEntry = {
    id: createId("bnk"),
    createdAt: input.createdAt || new Date().toISOString(),
    channel: input.channel,
    direction: input.direction,
    amountPaisa: amount,
    source: input.source,
    reference: input.reference ?? null,
    note: input.note.trim() || "Adjustment",
    storeId: input.storeId ?? env.storeId,
  }

  writeStore({
    ...store,
    entries: [entry, ...store.entries],
  })
  return entry
}

export function listLedgerEntries(): BankingLedgerEntry[] {
  return [...ensureBankingSeeded().entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getOpeningBalances(): BankingOpeningBalances {
  return ensureBankingSeeded().opening
}
