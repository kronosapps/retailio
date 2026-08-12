import { useSyncExternalStore } from "react"

import type { MenuCategory, MenuVariant } from "@/data/menu"

export const POS_SESSION_COUNT = 3
export type PosSessionId = 1 | 2 | 3

export type PosCartLine = {
  item: MenuVariant
  qty: number
  /** Free punch-card reward line (not editable like normal menu items). */
  isLoyaltyReward?: boolean
}

export type PosMenuPanel = "menu" | "discounts" | "loyalty"
export type PosLoyaltyMode = "off" | "percent" | "item"

export type PosSession = {
  id: PosSessionId
  cart: PosCartLine[]
  applyOccasion: boolean
  friendsFamilyPercent: number
  /** Applied coupon code (uppercase); empty = none. */
  couponCode: string
  discountTab: string
  menuPanel: PosMenuPanel
  category: MenuCategory
  loyaltyMode: PosLoyaltyMode
  selectedLoyaltyRewardId: string | null
  lastInvoiceId: string | null
  receiptInvoiceId: string | null
  chargeError: string | null
}

type PosSessionStoreState = {
  activeSessionId: PosSessionId
  sessions: Record<PosSessionId, PosSession>
}

type Listener = () => void

export function emptyPosSession(id: PosSessionId): PosSession {
  return {
    id,
    cart: [],
    applyOccasion: false,
    friendsFamilyPercent: 0,
    couponCode: "",
    discountTab: "occasion",
    menuPanel: "menu",
    category: "All",
    loyaltyMode: "off",
    selectedLoyaltyRewardId: null,
    lastInvoiceId: null,
    receiptInvoiceId: null,
    chargeError: null,
  }
}

function createInitialState(): PosSessionStoreState {
  return {
    activeSessionId: 1,
    sessions: {
      1: emptyPosSession(1),
      2: emptyPosSession(2),
      3: emptyPosSession(3),
    },
  }
}

let state: PosSessionStoreState = createInitialState()
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function getPosSessionStore(): PosSessionStoreState {
  return state
}

export function getActivePosSession(): PosSession {
  const s = state.sessions[state.activeSessionId]
  return { ...s, couponCode: s.couponCode ?? "" }
}

export function subscribePosSessions(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setActivePosSession(id: PosSessionId): boolean {
  if (id === state.activeSessionId) return true
  if (!(id in state.sessions)) return false
  state = { ...state, activeSessionId: id }
  emit()
  return true
}

export function updatePosSession(
  id: PosSessionId,
  patch: Partial<Omit<PosSession, "id">>
): void {
  const current = state.sessions[id]
  if (!current) return
  state = {
    ...state,
    sessions: {
      ...state.sessions,
      [id]: { ...current, ...patch, id },
    },
  }
  emit()
}

export function updateActivePosSession(
  patch: Partial<Omit<PosSession, "id">>
): void {
  updatePosSession(state.activeSessionId, patch)
}

/**
 * Reset cart/discounts/loyalty/errors for a session.
 * Keeps lastInvoiceId so the “Recorded as …” hint can still show after pay.
 */
export function clearPosSession(id: PosSessionId): void {
  const current = state.sessions[id]
  if (!current) return
  state = {
    ...state,
    sessions: {
      ...state.sessions,
      [id]: {
        ...emptyPosSession(id),
        lastInvoiceId: current.lastInvoiceId,
        receiptInvoiceId: current.receiptInvoiceId,
      },
    },
  }
  emit()
}

export function sessionItemCount(session: PosSession): number {
  return session.cart.reduce((sum, line) => sum + line.qty, 0)
}

export function usePosSessions() {
  return useSyncExternalStore(subscribePosSessions, getPosSessionStore)
}
