# Accounting — parked backlog

Status: **foundation is in** (`/utilities/accounting`). Day-2 hardening below is **parked**, not blocking the ERP-vs-POS milestone.

Parked after foundation close. Last updated: 2026-08-12.

Resume only when ops or CA need tighter books — do **not** expand into multi-company / accounting SaaS.

---

## Reports & export

- [ ] **P&L Excel export** (`UtilitiesExportService` — TB / BS / daybook / cash flow already export)
- [ ] Optional: period picker on P&L / TB / BS (today = active financial year only)
- [ ] Stronger Balance Sheet balance UX when openings / projection leave imbalance

---

## Cash flow

- [ ] GL-derived operating cash flow (from cash/UPI journal lines), not only Banking snapshot
- [ ] Investing / financing sections — **defer** unless single-store retail actually needs them
- [ ] Reconcile Banking balances ↔ Cash (1000) / UPI (1010) ledger closings

---

## Subledgers (AR / AP)

- [ ] **AR aging** view (customer / invoice buckets) — posting exists; no aging UI in accounting
- [ ] **AP aging** view (supplier / bill buckets) — purchasing has ops; no aging UI in accounting
- [ ] Link aging rows → account statement / source document

---

## Period close & openings

- [ ] FY **period lock** (block new journals into closed FY)
- [ ] Year-end **closing entries** (P&L → retained earnings) as durable posted journals
- [ ] Opening-balance journal workflow in accounting UI (today: banking openings + projection notes)

---

## Journal hygiene

- [ ] Reverse / void posted journal (compensating entry; keep audit trail)
- [ ] Journal list filter by `referenceType` / source (posted vs projected) beyond Daybook
- [ ] Reduce reliance on **projection backfill** once all live paths always post

---

## Chart of accounts & expenses

- [ ] Expense **category → CoA** mapping (today: single Expenses `5000`)
- [ ] Optional: add a few fixed expense sub-accounts (rent, utilities, wages) without free-form CoA editor
- [ ] Editable CoA UI — **keep out of scope** unless posting rules are redesigned

---

## Cost & GST linkage

- [ ] Harden **COGS / inventory cost basis** so P&L gross profit is trustworthy
- [ ] Reconcile GST Payable / GST Input ledgers with `/utilities/gst` reports  
      (filing / HSN still in `docs/GST_TODO.md`)

---

## Suggested resume order

1. P&L Excel export  
2. AR / AP aging (read-only)  
3. Banking ↔ cash/UPI ledger reconcile + GL cash-flow view  
4. Journal reverse + period lock  
5. Expense category mapping / COGS hardening  
6. FY closing entries  

---

## Out of scope while parked

- Multi-company / consolidations  
- Full IAS / Ind-AS cash-flow packs  
- Statutory audited / CA e-filing packs beyond Excel utilities  
- Free-form editable chart of accounts  

---

## Code map (for later)

| Area | Path |
|------|------|
| Service / reports | `src/modules/accounting/AccountingService.ts` |
| Rules / engine | `src/modules/accounting/rules/AccountingRules.ts`, `AccountingEngine.ts` |
| Export | `src/modules/utilities/UtilitiesExportService.ts` |
| UI | `src/pages/utilities/AccountingPages.tsx` |
| Foundation doc | `docs/ACCOUNTING.md` |
| GST parked | `docs/GST_TODO.md` |
