import { useSyncExternalStore } from "react"

import {
  getCashCounterServerSnapshot,
  getCashCounterSnapshot,
  subscribeCashCounter,
  type CashReceiptPeek,
} from "../store/cashCounter"

/** Live next cash slip for today — updates as soon as a cash payment is allocated. */
export function useCashCounter(): CashReceiptPeek {
  return useSyncExternalStore(
    subscribeCashCounter,
    getCashCounterSnapshot,
    getCashCounterServerSnapshot
  )
}
