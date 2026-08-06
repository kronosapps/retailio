# Company WhatsApp receipts

> **Preferred path:** the [Notification Engine](./NOTIFICATION_ENGINE.md) queues receipts after `PAYMENT_RECEIVED` and sends them via **Firebase Cloud Functions → Meta WhatsApp Cloud API**. Credentials never enter the Vite app.

RetailOS can also send receipts **manually** from the Receipt dialog (legacy webhook / device WhatsApp fallback).

Browsers cannot talk to WhatsApp as a Business account directly. Cloud Functions (or a webhook) hold API credentials server-side.

---

## Options

| Option | Pros | Cons |
|--------|------|------|
| **Meta WhatsApp Cloud API** + Apps Script / Cloud Function | Official, scalable | Needs Meta Business verification + templates for some message types |
| **BSP** (Wati, Interakt, AiSensy, Twilio, etc.) | Faster setup, dashboards | Monthly cost |
| **wa.me on POS device** (fallback) | No setup | Opens chat on the cashier device — not “company sends” |

Recommended for RetailOS: webhook URL in env (same pattern as Google Sheets).

---

## Configure RetailOS

### 1. Env (preferred)

In `.env`:

```env
VITE_WHATSAPP_WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec
```

### 2. Or Payment dialog → Edit merchant settings

- **WhatsApp business name** — label shown on POS (“Sending as …”)
- **WhatsApp send webhook** — your Apps Script / Cloud Function / BSP URL

Restart Vite after changing `.env`.

When configured, **Send to mobile** → enter customer number → **Send via company WhatsApp**. No WhatsApp window opens on the POS.

---

## Webhook contract

RetailOS POSTs JSON (as `text/plain` body, Apps Script–friendly):

```json
{
  "action": "send_receipt",
  "channel": "whatsapp",
  "to": "919876543210",
  "message": "*Store*\nInvoice: INV-…\n…",
  "invoiceId": "INV-20260805-00012",
  "businessName": "Pavani's Foods"
}
```

`to` is digits only with country code (India → `91…`).

---

## Sample Apps Script → Meta Cloud API

1. Meta Developer → WhatsApp → get **Phone number ID** + **permanent token**
2. Apps Script project → store token in Script Properties (`WA_TOKEN`, `WA_PHONE_ID`)
3. Deploy as Web App (Execute as Me, Anyone)
4. Paste `/exec` URL into `VITE_WHATSAPP_WEBHOOK_URL`

```javascript
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action !== "send_receipt") {
      return json_({ ok: false, error: "unsupported action" });
    }

    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty("WA_TOKEN");
    var phoneId = props.getProperty("WA_PHONE_ID");
    if (!token || !phoneId) {
      return json_({ ok: false, error: "WA_TOKEN / WA_PHONE_ID missing" });
    }

    var payload = {
      messaging_product: "whatsapp",
      to: String(body.to),
      type: "text",
      text: { body: String(body.message || "") },
    };

    var res = UrlFetchApp.fetch(
      "https://graph.facebook.com/v21.0/" + phoneId + "/messages",
      {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      }
    );

    return json_({
      ok: res.getResponseCode() >= 200 && res.getResponseCode() < 300,
      status: res.getResponseCode(),
      body: res.getContentText(),
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
```

**Note:** Outside the 24-hour customer-care window, Meta often requires an approved **template** message instead of free-form text. Adjust the payload to `type: "template"` when you go live.

---

## Security

- Keep Meta / BSP tokens **only** in Apps Script properties or a Cloud Function — never in Vite `VITE_*` vars (those are public in the browser).
- Treat the webhook URL like a secret; redeploy if it leaks.
