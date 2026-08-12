# Accounting Foundation (single-company)

Lightweight general ledger for RetailOS as a **single-company retail ERP** — not multi-entity accounting SaaS.

Status: foundation in place. UI under **Utilities → Accounting**.

Day-2 hardening is parked in [`docs/ACCOUNTING_TODO.md`](./ACCOUNTING_TODO.md).

---

## Scope

| Capability | Status |
|------------|--------|
| Chart of Accounts | Fixed retail CoA (`chartOfAccounts.ts`) |
| Ledger accounts / statements | Yes |
| Journal entries (DR/CR) | Posted + projected hybrid |
| Receivables (AR) | Sale / credit / settlement rules |
| Payables (AP) | Purchase invoice → supplier payment |
| Expenses | Expense → Cash/UPI journal |
| Trial Balance | Active FY |
| Profit & Loss | Active FY; feeds BS retained earnings |
| Balance Sheet | Assets / liabilities / equity (+ period RE) |
| Cash Flow | Lightweight banking cash + UPI (not full IAS) |
| Manual journal | Balanced adjusting entries |
| Multi-company | **Out of scope** |

---

## Pipelines → journals

Posting is **event-driven** via `AccountingEngine` (not from React).

```text
Sale
  → Payment (or AR)
  → Journal (cash/UPI/AR, sales, GST, COGS/inventory)

Purchase invoice
  → Accounts Payable
  → Journal; settle AP on supplier payment

Expense
  → Cash / Bank (UPI)
  → Journal

Refund / sales return / credit note / inventory movement
  → Matching reversing or inventory journals
```

Rules live in `AccountingRules`. Durable store: `JournalRepository` (`source: "posted"`). Older activity without a posted row is **projected** on read and merged preferencing posted.

---

## Reports

| Report | How |
|--------|-----|
| Daybook | Merged journals chronologically |
| Trial Balance | Sum DR/CR by account for FY |
| P&L | Income − expense accounts; gross ≈ Sales − returns − COGS |
| Balance Sheet | Asset / liability / equity TB + provisional retained earnings from P&L |
| Cash Flow | Banking snapshot (operating cash/UPI only) |
| Account Statement | Running balance for one CoA code |

---

## Code map

| Area | Path |
|------|------|
| CoA | `src/modules/accounting/chartOfAccounts.ts` |
| Rules | `src/modules/accounting/rules/AccountingRules.ts` |
| Engine (EventBus) | `src/modules/accounting/AccountingEngine.ts` |
| Service / reports | `src/modules/accounting/AccountingService.ts` |
| Projection | `src/modules/accounting/AccountingProjectionService.ts` |
| Types | `src/modules/accounting/types.ts` |
| UI | `src/pages/utilities/AccountingPages.tsx` |
| Routes | `/utilities/accounting`, `chart-of-accounts`, `manual-journal`, `profit-loss`, … |

Bootstrap starts `AccountingEngine` with other engines (`docs/ARCHITECTURE.md`).

---

## Explicit non-goals (for now)

- Multi-company / consolidations  
- Full IAS cash-flow (investing / financing)  
- Statutory audited packs / CA export packs beyond Excel utilities  
- Editable CoA UI (codes stay fixed for posting rules)

See also the parked checklist in [`ACCOUNTING_TODO.md`](./ACCOUNTING_TODO.md).
