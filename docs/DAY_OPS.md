# Day Operations (Start of Day / End of Day)

Store operational boundary for single-company retail:

```text
Open Day  →  Operations  →  Close Day
```

Status: **foundation in place**. UI: **Day Ops** (`/day-ops`).

Parked hardening: [`docs/DAY_OPS_TODO.md`](./DAY_OPS_TODO.md).

---

## Ownership

| Layer | Job |
|-------|-----|
| **DayOps** | Store business day open/close + closing review panels |
| **Shifts** | Cashier till float / variance (`/shifts`) |
| **Banking** | Cash/UPI cashbook (`/banking`) |
| **EndOfDayService** | Google Sheets export adapter (optional step on close) |

Options → “Sheets sync (advanced)” remains a manual re-sync only.

---

## End of Day panels

- Sales summary  
- Cash summary  
- UPI summary  
- Refunds  
- Discounts  
- Expenses  
- Stock exceptions (posted stock takes with variance + damage/wastage/adjustments)  
- Cashier variance (shifts)  
- Day closing (freeze snapshot + optional Sheets sync)

---

## Start of Day

- Open Day captures opening cash/UPI (defaults from banking balances)  
- Blocks a second open day until the current one is closed  
- Does not force-open cashier shifts (link to Shifts)

---

## Code map

| Area | Path |
|------|------|
| Service | `src/modules/dayOps/DayOpsService.ts` |
| Types | `src/modules/dayOps/types.ts` |
| Local store | `src/data/businessDays.ts` |
| Repository | `src/repositories/BusinessDayRepository.ts` |
| UI | `src/pages/DayOpsPage.tsx` |
| Sheets adapter | `src/modules/reports/EndOfDayService.ts` |
| Events | `DAY_OPENED`, `DAY_CLOSED` |
| Collection | `business_days` |

---

## Explicit non-goals (for now)

- Soft-locking POS when day is not OPEN  
- Multi-store day calendars  
- Replacing cashier shifts with the business day entity
