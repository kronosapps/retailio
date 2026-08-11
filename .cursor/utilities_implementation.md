# RetailOS — Utilities & Accounting Administration Module

You are working on the existing **RetailOS** application.

Implement a new top-level **Utilities** section that acts as the administrative, configuration, accounting, statutory-reporting, and operational-utilities workspace for the store.

This must be implemented as a properly separated module.

Do NOT turn Utilities into a miscellaneous collection of unrelated pages.

The Utilities section should provide a structured home for:

* Business setup
* Financial year
* Barcode generator
* Recycle Bin
* Daybook
* All Transactions
* Trial Balance
* Balance Sheet
* Cash Flow
* Reports by Item
* Reports by Operator/Cashier
* Reports by Role
* GST Reports
* TCS Reports
* Form 27EQ
* Expense Reports
* Account Statement

The architecture must remain extensible because additional accounting and statutory utilities will be added later.

---

# 1. CORE ARCHITECTURAL PRINCIPLE

RetailOS currently follows:

```text
React UI
   ↓
Business Module / Service
   ↓
Repository
   ↓
Firestore + localStorage fallback
   ↓
Domain Events
   ↓
EventBus
   ↓
SyncManager
   ↓
SyncProvider
   ↓
Google Sheets
```

Preserve this architecture.

Firebase/Firestore remains the source of truth.

Utilities is a consumer/orchestrator of existing business data and configuration.

Utilities must NOT become a second database.

---

# 2. SEPARATION OF CONCERNS

Utilities should NOT directly access:

* Firestore
* Firebase Auth
* Google Sheets
* fetch
* axios
* localStorage for business data

from React pages/components.

Instead:

```text
Utilities UI
    ↓
Utilities Service
    ↓
Existing domain services/repositories
    ↓
Source of truth
```

For accounting:

```text
Sales
Payments
Refunds
Expenses
Purchases
Inventory
Banking
Customers
Suppliers
        ↓
Accounting/Reporting Projection
        ↓
Utilities
```

Do not duplicate business logic unnecessarily.

---

# 3. UTILITIES INFORMATION ARCHITECTURE

Create a Utilities landing page.

Recommended structure:

```text
Utilities
│
├── Business Setup
│
├── Financial Year
│
├── Barcode Generator
│
├── Recycle Bin
│
├── Daily Operations
│   ├── Daybook
│   └── All Transactions
│
├── Accounting
│   ├── Trial Balance
│   ├── Balance Sheet
│   ├── Cash Flow
│   └── Account Statement
│
├── Analysis
│   ├── Report by Item
│   ├── Report by Operator
│   ├── Report by Role
│   └── Expense Reports
│
└── Statutory
    ├── GST Reports
    ├── TCS Reports
    └── Form 27EQ
```

Use the project's existing navigation/layout conventions.

Do not create a completely separate application shell unless required by the current architecture.

---

# 4. UTILITIES LANDING PAGE

Create a clean Utilities dashboard.

Use grouped cards rather than a giant flat menu.

Example:

```text
Utilities

Business & Setup
──────────────────────────────────
Business Setup
Financial Year
Barcode Generator
Recycle Bin


Daily Operations
──────────────────────────────────
Daybook
All Transactions


Accounting
──────────────────────────────────
Trial Balance
Balance Sheet
Cash Flow
Account Statement


Analysis
──────────────────────────────────
Report by Item
Report by Operator
Report by Role
Expense Reports


Statutory
──────────────────────────────────
GST Reports
TCS Reports
Form 27EQ
```

Each card should have:

* Icon
* Title
* Short description
* Navigation action

Use existing UI components.

---

# 5. BUSINESS SETUP

Create a Business Setup utility.

This should manage store/business configuration.

Possible sections:

## Business Identity

```text
Legal Business Name
Trade Name
Business Type
Address
City
State
PIN
Country
Phone
Email
Website
```

## Tax Identity

```text
GSTIN
PAN
TAN
State
GST Registration Type
```

## Invoice/Receipt Settings

```text
Invoice Prefix
Invoice Number Format
Receipt Footer
Default Tax Settings
```

## Banking

Where applicable, integrate with the existing Banking configuration rather than duplicating it.

Important:

Do not hardcode business information in React components.

Use the existing environment/configuration architecture where appropriate.

If a setting needs persistence beyond environment variables, introduce a proper Settings repository/service.

Do not mix static configuration with transactional data.

---

# 6. FINANCIAL YEAR

Create a Financial Year management utility.

Purpose:

> Define the accounting period used by reports and financial statements.

The system should support:

```text
Financial Year
Start Date
End Date
Status
```

For example:

```text
FY 2026–27
01-Apr-2026 → 31-Mar-2027
Active
```

Features:

* View current financial year
* Create/select financial year where appropriate
* View previous financial years
* Prevent overlapping financial years
* Clearly identify active financial year

Do not silently alter historical financial data when changing the active financial year.

Financial year selection must become available to:

* Daybook
* Trial Balance
* Balance Sheet
* Cash Flow
* Account Statement
* GST reports
* TCS reports
* Form 27EQ
* Expense reports

where relevant.

---

# 7. BARCODE GENERATOR

Create a Barcode Generator utility.

Purpose:

> Generate printable barcodes for products/items.

The utility should allow:

```text
Select Product
OR
Enter SKU / Barcode Value

Barcode Format
Barcode Value
Quantity
```

Allow preview.

Provide:

```text
[Generate]
[Print]
```

Where technically appropriate, support common retail barcode formats.

Do not change the Product/Inventory domain merely to support barcode generation.

Barcode generation should consume existing product data.

If a product already has a barcode, use it.

If the product has no barcode, allow generating a barcode value without silently overwriting the product record.

If the user explicitly chooses to save the generated barcode to the product, use:

```text
UI
 ↓
ProductService
 ↓
ProductRepository
```

not direct persistence.

---

# 8. RECYCLE BIN

Create a Recycle Bin utility.

Purpose:

> Allow administrators to review and recover deleted/deactivated records where supported.

Do NOT physically delete business records unnecessarily.

Prefer soft deletion.

Potential entities:

```text
Products
Customers
Suppliers
Expenses
Other supported master records
```

The Recycle Bin should show:

```text
Record
Type
Deleted/Archived Date
Deleted By
Original Status
Actions
```

Actions:

```text
Restore
Permanently Delete
```

Permanent deletion must be heavily restricted.

Do not allow deletion of transactional records such as:

* Paid invoices
* Payments
* Completed sales
* Accounting entries

unless the existing business architecture explicitly supports safe archival/deletion.

The system must preserve financial auditability.

---

# 9. DAYBOOK

Create a Daybook utility.

Purpose:

> Show all financial/business activity for a selected day or period in chronological order.

Filters:

```text
Date
Financial Year
Transaction Type
Account
Operator
Payment Method
```

Display:

```text
Date
Time
Transaction ID
Transaction Type
Description
Debit
Credit
Balance
Operator
Reference
```

The Daybook should be read-only.

It should derive data from existing transactions.

Do not create a second transaction store.

---

# 10. ALL TRANSACTIONS

Create an All Transactions utility.

This should provide a consolidated view of business transactions.

Potential transaction types:

```text
Sale
Payment
Refund
Expense
Purchase
Stock Adjustment
Banking Entry
Customer Payment
Supplier Payment
```

Use actual domain types available in the codebase.

Columns:

```text
Date
Transaction ID
Type
Description
Debit
Credit
Amount
Payment Method
Account
Operator
Status
```

Filters:

```text
Date
Financial Year
Transaction Type
Operator
Role
Payment Method
Account
Status
```

This is a read-only analytical view.

---

# 11. TRIAL BALANCE

Create a proper Trial Balance screen.

Purpose:

> Summarize debit and credit balances of accounts for a selected period.

Structure:

```text
TRIAL BALANCE

Account                         Debit          Credit
-----------------------------------------------------
Cash                            ₹XX,XXX
UPI                             ₹XX,XXX
Sales                                          ₹XX,XXX
GST Payable                                   ₹XX,XXX
Expenses                       ₹XX,XXX
Capital                                         ₹XX,XXX
-----------------------------------------------------
TOTAL                           ₹XX,XXX        ₹XX,XXX
```

Important:

Debit and credit must remain separate.

Do NOT show this as a simple income/expense report.

The Trial Balance must validate:

```text
Total Debit = Total Credit
```

If it does not balance, clearly display an accounting integrity warning.

Do not invent accounting entries to force the totals to balance.

---

# 12. BALANCE SHEET

Create a proper Balance Sheet.

Use standard accounting presentation with separate:

```text
LIABILITIES
+
EQUITY
```

and

```text
ASSETS
```

Example structure:

```text
BALANCE SHEET
As of 31 March 2027

LIABILITIES & EQUITY          ASSETS
──────────────────────        ─────────────────────
Capital                       Cash
Retained Earnings             Bank / UPI
Current Liabilities           Inventory
  GST Payable                 Receivables
  Other Payables              Other Assets

TOTAL                         TOTAL
```

The implementation must distinguish:

* Assets
* Liabilities
* Equity

Do not simply rename the Dashboard totals into a balance sheet.

If the current RetailOS data model is insufficient to produce a formally complete balance sheet, do not fabricate accounting data.

Instead:

1. Identify missing accounting concepts.
2. Build the reporting structure.
3. Clearly mark unsupported sections.
4. Create the necessary accounting domain abstractions for future completion.

---

# 13. CASH FLOW

Create a Cash Flow utility.

Show cash movement over a selected period.

At minimum distinguish:

```text
Opening Cash
Cash Inflows
Cash Outflows
Closing Cash
```

Where the data supports it, classify:

```text
Operating Activities
Investing Activities
Financing Activities
```

Do not treat UPI as physical cash.

Respect the existing Banking module's distinction between:

```text
Cash
UPI
```

Use the existing Banking data where appropriate.

---

# 14. ACCOUNT STATEMENT

Create an Account Statement utility.

Purpose:

> Show chronological debit/credit activity for a selected account.

UI:

```text
Account
[Select Account ▼]

Period
[Start Date] → [End Date]

Opening Balance
₹XX,XXX

Date       Description       Debit       Credit      Balance
-------------------------------------------------------------
01-Apr     Opening                        ₹10,000    ₹10,000
02-Apr     Sale                          ₹2,500      ₹12,500
03-Apr     Expense             ₹500                  ₹12,000
```

Allow:

* Account selection
* Date range
* Financial year
* Export

The balance must be calculated consistently.

---

# 15. REPORT BY ITEM

Create an Item report utility.

This should provide detailed performance by product/item.

Include:

```text
Item
SKU
Category
Units Sold
Gross Sales
Discount
GST
Net Sales
Average Selling Price
Current Stock
Stock Value
```

Allow filters:

```text
Date
Financial Year
Category
Item
```

Allow sorting:

```text
Highest Sales
Highest Units
Lowest Sales
Lowest Units
Highest Stock
Lowest Stock
```

Reuse the Reporting module where possible.

Do not create duplicate report calculations.

---

# 16. REPORT BY OPERATOR / CASHIER

Create an Operator report.

Operator means the staff member who performed the transaction.

Include:

```text
Operator
Role
Transactions
Invoices
Items Sold
Gross Sales
Discounts
Refunds
Net Sales
Cash Sales
UPI Sales
Average Transaction
```

Allow:

```text
Date Range
Financial Year
Operator
Payment Method
```

This report must use the existing Staff/User identity model.

Do not create another user model.

---

# 17. REPORT BY ROLE

Create a Role-based report.

Roles currently include:

```text
Admin
Manager
Cashier
```

Use the existing RetailOS role definitions.

The report should summarize operational activity by role.

Example:

```text
Role       Transactions     Sales       Refunds
------------------------------------------------
Cashier        320          ₹XX,XXX       ₹X,XXX
Manager         42          ₹XX,XXX       ₹X,XXX
Admin            8          ₹XX,XXX       ₹X,XXX
```

Do not confuse:

```text
Operator
```

with:

```text
Role
```

Operator = individual user.

Role = permission category.

---

# 18. EXPENSE REPORTS

Create an Expense Reports utility.

Use the existing Expense domain/repository.

Include:

```text
Total Expenses
Expenses by Category
Expenses by Date
Expenses by Payment Method
Expenses by Operator
```

Detailed table:

```text
Date
Expense ID
Category
Description
Amount
Payment Method
Operator
Reference
```

Allow:

```text
Date Range
Financial Year
Category
Payment Method
Operator
```

Do not create a second expense database.

---

# 19. GST REPORTS

Create a dedicated GST Reports area.

IMPORTANT:

This is a statutory/tax reporting area.

Do not fabricate GST calculations.

First inspect the existing:

* Invoice model
* Tax/GST fields
* Business GST configuration
* Customer GST data
* Product GST data
* State/place-of-supply information
* Refunds
* Credit notes if supported
* B2B/B2C information

Design the reporting architecture around the actual available data.

Potential reports include:

```text
Sales GST Summary
Taxable Sales
CGST
SGST
IGST
GST by Rate
B2B Sales
B2C Sales
Credit/Refund Adjustments
```

Where the data is insufficient for a statutory report:

DO NOT invent missing fields.

Clearly identify what additional domain data is required.

---

# 20. TCS REPORTS

Create a TCS Reports section.

First inspect the existing data model to determine whether TCS-related information exists.

Potential structure:

```text
TCS Summary
TCS Transactions
TCS Collected
TCS Applicable Base
TCS Rate
Party
Transaction
Financial Year
```

Do not assume a TCS rate.

Do not hardcode tax rules.

Make rates/configuration data-driven.

If the existing RetailOS data model cannot support the required statutory report, build the report architecture but explicitly mark unsupported fields.

---

# 21. FORM 27EQ

Create a Form 27EQ utility.

This is a statutory reporting area.

Do not pretend the application can generate a legally compliant Form 27EQ merely by displaying transaction totals.

First inspect whether RetailOS currently stores the information needed for Form 27EQ.

Identify required concepts such as:

```text
Deductor information
Collector information
PAN
TAN
Party information
Transaction details
TCS details
Financial year
Quarter
Amount
Tax collected
Tax deposited
Challan/reference information
```

Only implement fields supported by the current data model.

Where required information does not exist:

* identify the missing domain model
* create appropriate extension points
* do not fabricate values
* clearly mark the report as incomplete/not statutory-ready

The UI must not claim "Government compliant" unless the implementation actually supports the required statutory data.

---

# 22. REPORTING ARCHITECTURE REUSE

RetailOS already has a Reporting concept.

Do NOT create:

```text
Utilities Reporting
```

as a second reporting architecture.

Instead:

```text
Reporting Module
       ↑
       │
Utilities
       │
       ├── Accounting Views
       ├── Statutory Views
       └── Operational Utilities
```

Utilities should consume the existing Reporting module for:

* Item reports
* Operator reports
* Role reports
* Expense reports
* Sales reports
* Inventory reports

Extend the Reporting module if additional report services are needed.

Do not duplicate calculations.

---

# 23. ACCOUNTING DOMAIN LAYER

The accounting utilities may reveal that RetailOS currently lacks a proper accounting ledger.

Before implementing Trial Balance, Balance Sheet, Cash Flow, and Account Statement:

Audit whether the current application has:

```text
Chart of Accounts
Ledger Accounts
Journal Entries
Debit
Credit
Opening Balance
Closing Balance
Account Types
```

If these concepts do not exist, DO NOT fake them using arbitrary sales totals.

Instead introduce a clean accounting abstraction:

```text
src/modules/accounting/
│
├── types/
├── services/
├── repositories/
├── ledger/
├── accounts/
└── rules/
```

Only introduce this if the existing system genuinely lacks the required accounting layer.

Architecture:

```text
Business Events
      ↓
Accounting Rules
      ↓
Journal Entries
      ↓
General Ledger
      ↓
Trial Balance
      ↓
Balance Sheet
      ↓
Cash Flow
      ↓
Account Statement
```

This is preferable to hardcoding accounting calculations inside Utilities pages.

---

# 24. ACCOUNTING INTEGRATION

Where appropriate, existing events should eventually feed accounting entries.

For example:

```text
SALE
 ↓
Accounting Rule
 ↓
Debit: Cash / UPI / Receivable
Credit: Sales
Credit: GST Payable
```

Refund:

```text
REFUND
 ↓
Accounting Rule
 ↓
Reverse appropriate revenue/tax/payment entries
```

Expense:

```text
EXPENSE
 ↓
Debit: Expense Account
Credit: Cash / Bank / UPI
```

However:

DO NOT implement accounting rules blindly.

First inspect the existing data model.

Use explicit accounting rules.

Do not create hidden side effects inside reporting pages.

---

# 25. FINANCIAL YEAR IN ACCOUNTING

All accounting reports must support the active financial year.

The financial year should be a reusable domain concept.

Do not duplicate financial-year logic in every report.

Create a shared service such as:

```text
FinancialYearService
```

if appropriate.

It should provide:

```text
getActiveFinancialYear()
getFinancialYear(date)
validateDateInFinancialYear()
getFinancialYearRange()
```

Adapt to existing architecture.

---

# 26. RECYCLE BIN AND ACCOUNTING SAFETY

Financial transactions must not be casually deleted.

The Recycle Bin should distinguish:

```text
Master Data
```

from:

```text
Financial Transactions
```

Master data may support restore.

Financial records should generally support:

```text
Void
Reverse
Cancel
Credit Note
Adjustment
```

where the domain supports them.

Do not use physical deletion as a substitute for accounting correction.

---

# 27. EXPORT

All Utilities reports should be export-ready.

Reuse the Reporting module's export architecture:

```text
Report Service
     ↓
Normalized ReportResult
     ↓
Export Layer
     ├── Excel
     └── Google Sheets
```

Do not implement a second Excel exporter inside Utilities.

Do not implement a second Google Sheets transport.

---

# 28. PERMISSIONS

Utilities contains sensitive financial and administrative functionality.

Do not expose everything to every role.

Use the existing RBAC system.

Recommended initial access:

```text
Business Setup
→ Admin

Financial Year
→ Admin

Barcode Generator
→ Admin, Manager

Recycle Bin
→ Admin

Daybook
→ Admin, Manager

All Transactions
→ Admin, Manager

Trial Balance
→ Admin, Manager

Balance Sheet
→ Admin, Manager

Cash Flow
→ Admin, Manager

Account Statement
→ Admin, Manager

Item Reports
→ Admin, Manager

Operator Reports
→ Admin, Manager

Role Reports
→ Admin, Manager

Expense Reports
→ Admin, Manager

GST Reports
→ Admin, Manager

TCS Reports
→ Admin

Form 27EQ
→ Admin
```

Treat these as proposed defaults.

Inspect the existing permission model and adapt rather than creating a parallel RBAC system.

---

# 29. UI DESIGN PRINCIPLES

Utilities should feel like an administrative/accounting workspace.

Prioritize:

* Clear hierarchy
* Dense but readable tables
* Strong filtering
* Date/financial-year selection
* Clear debit/credit presentation
* Export actions
* Audit information
* Minimal visual clutter

Use existing RetailOS UI components.

Do not introduce a new visual system.

---

# 30. DEBIT / CREDIT PRESENTATION

Accounting screens must visually distinguish:

```text
Debit
Credit
Balance
```

Never combine them into a single "Amount" column for:

* Trial Balance
* Account Statement
* Daybook where applicable
* Balance Sheet
* Ledger views

Example:

```text
Date       Description       Debit       Credit      Balance
-------------------------------------------------------------
01-Apr     Opening                         10,000      10,000
02-Apr     Sale                            2,500      12,500
03-Apr     Expense              500                    12,000
```

Use correct accounting terminology.

Do not label every positive amount as "Credit" or every negative amount as "Debit" without applying the actual account rules.

---

# 31. DATA INTEGRITY

Utilities reports must be reproducible.

If a report is generated twice for the same:

```text
Financial Year
Date Range
Filters
```

against unchanged source data, the results should be consistent.

Do not use random calculations or UI state.

Do not silently exclude transactions.

If transactions are cancelled/refunded, apply the existing domain status rules.

---

# 32. AUDITABILITY

Where appropriate, reports should expose:

```text
Created At
Updated At
Operator
Reference ID
Transaction ID
```

Accounting reports should allow tracing:

```text
Report
 ↓
Ledger
 ↓
Journal Entry
 ↓
Business Transaction
```

Do not implement a fake audit trail.

Use existing IDs and events.

---

# 33. PERFORMANCE

Utilities reports may involve large data sets.

Do not:

```text
fetch everything
→ put everything in React state
→ calculate everything in JSX
```

Instead:

```text
UI
 ↓
Service
 ↓
Query/Repository
 ↓
Filtered Data
 ↓
Report Calculation
```

Use existing query/caching infrastructure.

Avoid duplicate Firestore reads.

---

# 34. TESTING

Add tests for:

## Financial Year

* Correct start/end
* No overlap
* Active year
* Historical year selection

## Daybook

* Correct transactions
* Correct ordering
* Correct date filtering

## Trial Balance

* Correct debit totals
* Correct credit totals
* Balance validation
* Unbalanced warning

## Balance Sheet

* Assets
* Liabilities
* Equity
* Total validation

## Cash Flow

* Opening balance
* Inflows
* Outflows
* Closing balance

## Account Statement

* Opening balance
* Debit
* Credit
* Running balance

## Operator Reports

* Correct operator aggregation
* Correct role association

## GST/TCS

* Correct aggregation from available tax data
* No fabricated fields

## Recycle Bin

* Restore
* Restriction on transactional deletion

## Barcode

* Correct generation
* Product integration

---

# 35. IMPORTANT — STATUTORY REPORTING SAFETY

GST, TCS and Form 27EQ are statutory areas.

Do not present an incomplete report as legally compliant.

The implementation should distinguish:

```text
Operational Report
```

from:

```text
Statutory Report
```

If the current data model is insufficient:

```text
Status:
Not statutory-ready

Reason:
Required source data is not currently captured.

Required additions:
...
```

Do not invent:

* PAN
* TAN
* GSTIN
* TCS rate
* Tax amount
* Challan number
* Filing details
* Party classification

Use configuration and persisted data only.

---

# 36. DOCUMENTATION

Update existing documentation rather than creating unnecessary documentation.

Document:

* Utilities architecture
* Accounting layer
* Financial year
* Report ownership
* RBAC
* Statutory reporting limitations
* Export architecture

Prefer:

```text
docs/ARCHITECTURE.md
docs/DEVELOPER_GUIDE.md
```

and existing relevant documentation.

---

# 37. IMPLEMENTATION ORDER

Do not attempt to implement everything in one giant rewrite.

Work in phases.

Recommended order:

```text
PHASE 1
Utilities shell + navigation

PHASE 2
Business Setup
Financial Year
Barcode Generator
Recycle Bin

PHASE 3
Daybook
All Transactions

PHASE 4
Reporting integration
Item
Operator
Role
Expense

PHASE 5
Accounting foundation
Chart of Accounts
Ledger
Journal Entries
Accounting Rules

PHASE 6
Trial Balance
Account Statement
Cash Flow
Balance Sheet

PHASE 7
GST reporting

PHASE 8
TCS reporting

PHASE 9
Form 27EQ

PHASE 10
Excel / Google Sheets integration

PHASE 11
Testing
Validation
Documentation
```

If the repository already contains parts of these features, integrate them rather than recreating them.

---

# 38. FIRST TASK — AUDIT BEFORE IMPLEMENTATION

Before writing code, inspect:

```text
src/modules/
src/repositories/
src/services/
src/events/
src/pages/
src/layouts/
src/types/
src/core/config/
src/core/firebase/
src/services/sync/
src/modules/banking/
src/modules/reports/
src/modules/expense/
src/modules/staff/
src/modules/inventory/
src/modules/payment/
```

Specifically identify:

1. Existing Reports implementation.
2. Existing Dashboard calculations.
3. Existing Banking ledger.
4. Existing Expense model.
5. Existing Invoice model.
6. Existing Payment model.
7. Existing Refund model.
8. Existing Inventory model.
9. Existing Staff/RBAC.
10. Existing Google Sheets export/sync.
11. Existing settings.
12. Existing deletion/soft-delete patterns.
13. Existing tax/GST fields.
14. Whether a real accounting ledger already exists.

Do not assume that any of these are missing.

---

# 39. IMPLEMENTATION RULE

For every proposed feature ask:

```text
Does this already exist?
```

If yes:

```text
Extend/refactor existing implementation.
```

If no:

```text
Add it using existing architecture.
```

Never create two competing implementations.

---

# 40. FINAL VALIDATION

Run the actual project scripts available in `package.json`.

At minimum:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Then manually verify:

```text
Utilities opens
Business Setup works
Financial Year works
Barcode Generator works
Recycle Bin works
Daybook works
All Transactions works
Item report works
Operator report works
Role report works
Expense report works
Trial Balance works
Account Statement works
Cash Flow works
Balance Sheet works
GST reports work according to available data
TCS reports work according to available data
Form 27EQ clearly indicates readiness/limitations
Excel export works
Google Sheets export uses existing infrastructure
RBAC works
Existing POS works
Existing Inventory works
Existing Banking works
Existing Dashboard works
```

---

# 41. FINAL CURSOR RESPONSE

At completion, provide a concise implementation report containing:

1. Existing functionality discovered.
2. Utilities architecture created.
3. Utilities pages created.
4. Accounting architecture created/extended.
5. Reports reused vs newly implemented.
6. Financial-year implementation.
7. Recycle Bin implementation.
8. Barcode implementation.
9. Excel/Google Sheets integration.
10. RBAC changes.
11. Statutory reporting capabilities and limitations.
12. Files created.
13. Files modified.
14. Tests added.
15. Validation results.
16. Remaining work.

Do not claim statutory compliance unless it has actually been implemented and validated.

Do not claim accounting correctness without an appropriate accounting data model.

The final architecture must preserve this principle:

> **RetailOS business modules own business data. Accounting owns accounting logic. Reporting owns analytical projections. Utilities owns administrative access to these capabilities. Excel and Google Sheets are export/reporting destinations. Firebase/Firestore remains the source of truth.**
