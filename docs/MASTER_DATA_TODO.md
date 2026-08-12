# Master Data — parked backlog

Status: **foundation is in** (`/utilities/master-data`). Hardening below is **parked**.

Last updated: 2026-08-12.

---

## Uniqueness & FKs

- [ ] Persist `categoryId` / `brandId` / `unitId` on products (keep denormalized name for Sheets)
- [ ] Product **name** soft-dedupe warning (SKU remains the hard unique key)
- [ ] Customer create: enforce unique phone (digits) and optional nameKey merge UX
- [ ] Supplier import path: reuse same nameKey rule as runtime create (already close)

---

## Recycle Bin & lifecycle

- [ ] Expand Recycle Bin beyond products — restore deactivated categories / brands / suppliers / customers
- [ ] Soft-delete brand/unit already exists; wire restore UI

---

## Tax & payment

- [ ] Drive GST settings default rate + POS GST % exclusively from tax-rate master
- [ ] POS PaymentDialog read **enabled** payment methods from master (today hardcoded Cash/UPI/OnAccount)
- [ ] Expense form tenders from same master

---

## UX

- [ ] Category create from inventory categories page should show `nameKey` conflict clearly
- [ ] Bulk “merge duplicate masters” tool (Chocolate + Chocolates → one)
- [ ] Master Data hub counts scoped strictly by `storeId` when multi-store appears

---

## Sync

- [ ] Sheets / sync providers for `brands` and `units` collections (Firestore collections exist)
- [ ] Document Firestore security rules for new collections

---

## Suggested resume order

1. POS/expense tenders from payment-method master  
2. Customer phone uniqueness on directory create  
3. Product FK fields + migration  
4. Recycle Bin for all soft-deactivated masters  
5. Merge-duplicates admin tool  

---

## Out of scope while parked

- Multi-company master catalogs  
- Editable CoA (see `docs/ACCOUNTING_TODO.md`)  
- Arbitrary new payment codes without banking/accounting rule updates  

---

## Code map

| Area | Path |
|------|------|
| Hub / CRUD UI | `src/pages/utilities/MasterDataPages.tsx` |
| Service | `src/modules/masterData/MasterDataService.ts` |
| Foundation doc | `docs/MASTER_DATA.md` |
