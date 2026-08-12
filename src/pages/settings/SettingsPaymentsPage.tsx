import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsService } from "@/modules/settings"
import type { PaymentSettings } from "@/modules/payment/settings/paymentSettings"

export function SettingsPaymentsPage() {
  const [form, setForm] = useState<PaymentSettings>(() =>
    SettingsService.getPaymentSettings()
  )
  const [msg, setMsg] = useState<string | null>(null)

  function field(
    key: keyof PaymentSettings,
    label: string,
    opts?: { type?: string; hint?: string }
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          type={opts?.type || "text"}
          value={String(form[key] ?? "")}
          onChange={(e) =>
            setForm({
              ...form,
              [key]:
                opts?.type === "number"
                  ? Number(e.target.value)
                  : e.target.value,
            })
          }
        />
        {opts?.hint ? (
          <p className="text-xs text-muted-foreground">{opts.hint}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Merchant UPI and session timeout. Meta / BSP access tokens never live
          in the browser — only webhook URLs.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        {field("merchantName", "Merchant name")}
        {field("merchantUpiId", "Merchant UPI ID")}
        {field("merchantMobile", "Merchant mobile")}
        {field("currency", "Currency")}
        {field("paymentTimeoutMinutes", "Payment timeout (minutes)", {
          type: "number",
        })}
        {field("whatsappBusinessName", "WhatsApp business label")}
        {field("whatsappWebhookUrl", "WhatsApp webhook URL", {
          hint: "Prefer VITE_WHATSAPP_WEBHOOK_URL in env for deploy; this is a local override.",
        })}
        {field("sheetsWebhookUrl", "Sheets webhook override", {
          hint: "Empty = use VITE_GOOGLE_SCRIPT_URL from env.",
        })}
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button
          type="button"
          onClick={() => {
            const saved = SettingsService.savePaymentSettings(form)
            setForm(saved)
            setMsg("Payment settings saved.")
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
