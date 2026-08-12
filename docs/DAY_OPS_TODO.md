# Day Ops — backlog

Status: **hardening implemented** (`/day-ops`). Items below were completed 2026-08-12.

---

## Workflow gates

- [x] Soft-warn POS sales when no business day is OPEN (banner + confirm on charge)
- [x] Require all cashier shifts closed before Close Day + inline close-shift UX
- [x] Re-open closed day (admin-only, audited via `reopenDay`)

---

## SOD polish

- [x] Editable opening cash/UPI on Open Day form (defaults from suggested openings)
- [x] SOD checklist: banking verified, float ready, printers, UPI QR
- [x] Carry forward yesterday’s banking close as today’s suggested open

---

## Closing panels

- [x] Enrich Sheets `DailyClose` with DayOps panel totals
- [x] Print day-close pack
- [x] Excel export of closing preview
- [x] Stock exceptions: negative stock + open PO/GRN pending (+ stock takes / movements)

---

## Dedup / cleanup

- [x] Share `dayKeyFromDate` via `dateRanges` (DayOps / EndOfDay)
- [x] Dashboard Quick Action → Day Ops
- [x] `ReportsService.salesSummary` delegates to DayOps preview (deprecated path)

---

## Out of scope (still)

- Multi-company day calendars  
- Merging Banking + Shifts into a single till entity  
- Hard-block POS (soft-warn only by product choice)

---

## Code map

| Area | Path |
|------|------|
| Service / export / UI | `src/modules/dayOps/`, `src/pages/DayOpsPage.tsx` |
| Foundation doc | `docs/DAY_OPS.md` |
