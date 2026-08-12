# Day Ops — parked backlog

Status: **foundation is in** (`/day-ops`). Hardening below is **parked**.

Last updated: 2026-08-12.

---

## Workflow gates

- [ ] Soft-warn or block POS sales when no business day is OPEN (product decision)
- [ ] Require all cashier shifts closed before Close Day (default already blocks; UX wizard to close shifts inline)
- [ ] Re-open closed day (admin-only, audited) beyond `force` on open

---

## SOD polish

- [ ] Editable opening cash/UPI on Open Day form (today defaults from banking)
- [ ] SOD checklist: banking verified, float ready, printers, UPI QR
- [ ] Carry forward yesterday’s banking close as today’s suggested open

---

## Closing panels

- [ ] Enrich Sheets `DailyClose` with DayOps panel totals (cash/UPI/discounts/expenses/variance)
- [ ] Print / PDF day-close pack
- [ ] Excel export of closing preview
- [ ] Stock exceptions: include GRN mismatches / negative stock alerts

---

## Dedup / cleanup

- [ ] Share one day-range helper across DayOps, TransactionsService, EndOfDayService
- [ ] Dashboard Quick Action “Reports” → Day Ops (if still pointing at Options)
- [ ] Retire weak `ReportsService.salesSummary` usage for day ops

---

## Suggested resume order

1. Editable SOD openings + Sheets DailyClose enrichment  
2. POS soft-gate when day closed  
3. Printable close pack  
4. Inline “close open shifts” from Day Ops  

---

## Out of scope while parked

- Multi-company day calendars  
- Merging Banking + Shifts into a single till entity  

---

## Code map

| Area | Path |
|------|------|
| Service / UI | `src/modules/dayOps/`, `src/pages/DayOpsPage.tsx` |
| Foundation doc | `docs/DAY_OPS.md` |
