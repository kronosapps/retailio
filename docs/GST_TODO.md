# GST / Tax — parked backlog

Status: **tax engine foundation is in** (`/utilities/gst`). Filing and catalog HSN are **not** production-ready.

Parked until CA confirms HSN mapping and we resume tax hardening. Last updated: 2026-08-12.

---

## Blocked on CA

- [ ] Obtain HSN (and rate confirmation) per product category from CA  
      Categories today: Madugula Halwa, Halwa Rolls, Hot, Sweet, Honey, Laddu, Combos  
- [ ] Fill `hsnCode` on all catalog products (seed / import / inventory UI)  
- [ ] Add or expose **HSN field** on inventory item create/edit (UI today focuses on GST %)  
- [ ] Optional: bulk “set HSN by category” helper once CA table exists  

Until then, GST HSN reports will show **UNMAPPED** for most lines.

---

## Tax data correctness (before any filing claim)

- [ ] Auto-issue **GST tax credit note** when a sales return settles (link to original invoice lines)  
      Manual `GstService.issueTaxNote` exists; not wired to sales-return / CRM store-credit path  
- [ ] Operational path for **tax debit notes** (not only manual issue by invoice id)  
- [ ] **Bill of supply** / composition-dealer behaviour (`compositionDealer` setting is unused in POS)  
- [ ] **SAC / services** billing path (field exists; no service lines)  
- [ ] Legacy invoices: only order-level GST — plan backfill or accept “new sales only” for HSN stats  
- [ ] Stronger **GSTIN** UX (format OK; no live verification / address fetch)  
- [ ] **Exclusive pricing** end-to-end as a polished tax-invoice mode (engine supports it; retail default is inclusive)  
- [ ] Formal **tax invoice PDF** layout (serial, party GSTIN, HSN table, signature/QR placeholders) — beyond current receipt text  

---

## Purchase / ITC

- [ ] Reconcile purchase invoice **input GST (ITC)** into GST reports  
- [ ] Scaffold for ITC vs outward tax (feeds future GSTR-3B)  

---

## Filing placeholders (do not rush)

Marked in app under **GST → Filing (soon)** (`GST_FILING_PLACEHOLDERS`).

| Item | App status | Prerequisites (summary) |
|------|------------|-------------------------|
| **GSTR-1** | PLANNED | Line HSN + rates, B2B GSTIN, PoS/IGST, tax CN/DN linked |
| **GSTR-3B** | PLANNED | GSTR-1 quality, purchase ITC reconciled, GST payable ledger |
| **E-Invoice** | NOT_STARTED | Stable tax invoice JSON, IRP credentials, B2B GSTIN master |
| **E-Way Bill** | NOT_STARTED | Dispatch address, transporter master, threshold rules |

- [ ] GSTR-1-**shaped export** from good invoices (still not filing)  
- [ ] GSTR-3B summary scaffold  
- [ ] E-Invoice IRN / QR integration  
- [ ] E-Way Bill integration  

`filingReady` must stay **`false`** until the above are real.

---

## Suggested resume order

1. CA HSN table → catalog + inventory UI  
2. Auto tax CN on sales return  
3. GSTR-1-shaped export (read-only / Excel)  
4. ITC ↔ report / 3B scaffold  
5. E-invoice / e-way only when turnover and ops require it  

---

## Code map (for later)

| Area | Path |
|------|------|
| Tax engine | `src/modules/gst/taxEngine.ts` |
| Service / reports / tax CN-DN | `src/modules/gst/GstService.ts` |
| Settings | `src/data/gstSettings.ts` |
| Tax documents store | `src/data/gstTaxDocuments.ts` |
| UI | `src/pages/utilities/GstBillingPage.tsx` → `/utilities/gst` |
| Line snapshot on sale | `RecordedSaleLine.taxSnapshot` in `src/data/invoices.ts` |
| POS wiring | `PricingService.priceOrder` + `PosPage` charge |

---

## Out of scope for “parked today”

Do **not** treat random web HSN codes as final. Product HSN must come from **CA confirmation**.
