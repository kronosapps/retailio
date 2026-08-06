# Connect Firestore → Google Sheets (RetailOS)

Firestore remains the **source of truth**.  
Google Sheets is for **reporting / backup / analytics** only.

RetailOS does **not** connect Firestore to Sheets with a Firebase plugin.  
Day sales sync is **End of Day** (Admin Options), not every transaction:

```text
During the day
  → Repositories write local + Firestore
  → Inventory / Products still sync live to Sheets

End of Day (Admin Options)
  → EndOfDayService reads today's (or yesterday's) invoices, payments,
    refunds, customers
  → GoogleSheetsSyncProvider POSTs batchInsert / insert
  → Google Apps Script appends rows (Invoices, Payments, Refunds,
    Customers, DailyClose)
```

Live event sync (inventory / products only):

```text
Repository write → EventBus → SyncManager → Google Sheets
```

---

## 1. Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) → **Blank spreadsheet**
2. Name it e.g. `RetailOS Sync`
3. Create tabs with **exact** names (case-sensitive):

| Tab name   | Used for                          |
|-----------|------------------------------------|
| `Invoices` | End-of-day invoice dump           |
| `Payments` | End-of-day payment dump           |
| `Inventory` | Inventory / product events (live) |
| `Customers` | End-of-day customer dump          |
| `Refunds` | End-of-day refund dump            |
| `DailyClose` | One summary row per EOD run     |
| `Suppliers` | Supplier events                  |
| `Expenses` | Expense events                    |
| `Products` | Product created / updated (live)  |

4. Optional: add a header row on each tab, e.g. for `Payments`:

```text
invoiceNumber | transactionReference | paymentId | amount | paymentMethod | status | paidAt | customerName | syncedAt
```

---

## 2. Attach Apps Script

1. In the Sheet: **Extensions → Apps Script**
2. Delete the sample code and paste:

```javascript
/**
 * RetailOS → Google Sheets webhook
 * Expects POST JSON:
 * { action: "insert", sheet: "Payments", data: { ... } }
 * { action: "batchInsert", sheet: "Payments", rows: [ {...}, ... ] }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheetName = body.sheet || "Sheet1";
    var action = body.action || "insert";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    if (action === "batchInsert") {
      var rows = body.rows || [];
      for (var i = 0; i < rows.length; i++) {
        appendObjectRow(sheet, rows[i] || {});
      }
    } else if (action === "insert" || action === "update") {
      appendObjectRow(sheet, body.data || {});
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function appendObjectRow(sheet, data) {
  var keys = Object.keys(data);
  if (keys.length === 0) return;

  // If sheet is empty, write headers first
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(keys.concat(["syncedAt"]));
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (header) {
    if (header === "syncedAt") return new Date().toISOString();
    var value = data[header];
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return value;
  });
  sheet.appendRow(row);
}

/** Manual smoke test from the Apps Script editor */
function testAppend() {
  appendObjectRow(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Payments"),
    {
      invoiceNumber: "INV-TEST",
      transactionReference: "INV-TEST",
      amount: 100,
      paymentMethod: "UPI",
      status: "Paid",
      paidAt: new Date().toISOString(),
    }
  );
}
```

3. **Save** the project (disk icon)

---

## 3. Deploy as Web App

1. Apps Script → **Deploy → New deployment**
2. Type: **Web app**
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone  
     (needed so the browser can POST without Google login; treat the URL like a secret)
4. **Deploy** → authorize Google permissions when prompted
5. Copy the **Web app URL**  
   Looks like: `https://script.google.com/macros/s/XXXX/exec`

If you edit the script later: **Deploy → Manage deployments → Edit → New version → Deploy**.

---

## 4. Put the URL in RetailOS `.env`

In `D:\Program-Projects\retailos\.env`:

```env
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
```

Restart Vite (`npm run dev`) so the env var loads.

Optional fallback: Payment dialog → **Edit merchant settings** → “Sheets webhook override”.

---

## 5. Test the connection

### A. Test Apps Script alone

In the Apps Script editor, run `testAppend` → check the `Payments` tab for a row.

### B. Test from RetailOS

1. Restart the Vite app after setting `.env` (`Ctrl+C`, then `npm run dev`)
2. Sign in and create an order → **Charge**
3. Open the Sheet → **`Invoices` tab** (not Payments) → new row  
   Charge publishes `INVOICE_CREATED` → writes to **Invoices**
4. Then **Mark as Paid** → check the **`Payments` tab**  
   That publishes `PAYMENT_RECEIVED` → writes to **Payments**

If you only look at `Payments` after Charge, it will look like sync “failed”.

### C. Debug queue (browser DevTools → Application → Local Storage)

| Key | Meaning |
|-----|---------|
| `retailos.sync.queue.v1` | Pending / completed sync jobs |
| `retailos.sync.deadletter.v1` | Failed after 3 retries |
| `retailos.events.log.v1` | Domain events published |

If the URL is empty, sync is skipped quietly (POS still works).

---

## 6. What gets synced today

| Event | Sheet tab |
|-------|-----------|
| `INVOICE_CREATED` / `INVOICE_UPDATED` | `Invoices` |
| `PAYMENT_RECEIVED` / `PAYMENT_FAILED` | `Payments` |
| `INVENTORY_CHANGED` | `Inventory` |
| `CUSTOMER_*` | `Customers` |
| `SUPPLIER_CREATED` | `Suppliers` |
| `EXPENSE_CREATED` | `Expenses` |
| `PRODUCT_CREATED` / `PRODUCT_UPDATED` | `Products` |

Invoice payload example (amounts in rupees):

```json
{
  "action": "insert",
  "sheet": "Invoices",
  "data": {
    "invoiceNumber": "INV-20260805-00012",
    "customerName": "Walk-in",
    "taxableAmount": 104.76,
    "sgstPercent": 2.5,
    "sgstAmount": 2.62,
    "cgstPercent": 2.5,
    "cgstAmount": 2.62,
    "gstPercent": 5,
    "gstAmount": 5.24,
    "total": 110
  }
}
```

Payment payload example:

```json
{
  "action": "insert",
  "sheet": "Payments",
  "data": {
    "invoiceNumber": "INV-20260804-00051",
    "transactionReference": "INV-20260804-00051",
    "paymentId": "PAY-20260804-00051",
    "amount": 548.5,
    "paymentMethod": "UPI",
    "status": "Paid",
    "paidAt": "2026-08-04T12:00:00.000Z",
    "customerName": "Walk-in",
    "upiTxnLast4": "4821",
    "cashReceiptNumber": null,
    "cashReceiptId": null
  }
}
```

Cash payments set `cashReceiptNumber` / `cashReceiptId` (daily counter) and leave `upiTxnLast4` null.

---

## Security notes

- Do **not** commit the Web App URL to git; keep it in `.env` only
- Sheets is a mirror — never treat it as the database
- For production, prefer a Cloud Function that writes to Sheets with a service account (no “Anyone” web app). The RetailOS `SyncProvider` interface already allows swapping providers later.

---

## Common issues

| Problem | Fix |
|--------|-----|
| Looking at wrong tab | **Charge** → `Invoices`. **Mark Paid** → `Payments` |
| No rows appear | Restart Vite after setting `VITE_GOOGLE_SCRIPT_URL` |
| CORS / sync Failed in queue | App uses `text/plain` + `no-cors` POST (required for Apps Script). Pull latest client code and hard-refresh |
| 401 / script auth page | Redeploy Web App; access must be **Anyone**; use a **New version** after script edits |
| Tab name mismatch | Tab must match exactly (`Invoices`, not `invoices`) |
| Empty-looking rows | Header row column names must match payload keys (`invoiceNumber`, `totalPaisa`, …). Clear the tab or fix headers |
| Queue stuck Failed / DeadLetter | Check `retailos.sync.deadletter.v1`; fix script, redeploy, charge again |
| Firestore OK but no sync | Confirm event in `retailos.events.log.v1` and that you are online |
