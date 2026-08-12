import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsService } from "@/modules/settings"
import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"
import { useAuth } from "@/providers/AuthProvider"

/** Invoice prefix + receipt footer (store settings doc). */
export function SettingsInvoicePage() {
  const { profile, userId } = useAuth()
  const storeId = profile?.storeId || SettingsService.getStoreIdDefault()
  const [form, setForm] = useState<StoreSettingsRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void SettingsService.getStoreSettings(storeId).then((s) => {
      if (!cancelled) setForm(s)
    })
    return () => {
      cancelled = true
    }
  }, [storeId])

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Invoice</h2>
        <p className="text-sm text-muted-foreground">
          Prefix and footer used on receipts. Full legal identity lives under{" "}
          <Link to="/utilities/business-setup" className="underline">
            Business Setup
          </Link>
          .
        </p>
      </div>

      {form ? (
        <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoicePrefix">Invoice prefix</Label>
            <Input
              id="invoicePrefix"
              value={form.invoicePrefix ?? ""}
              placeholder="INV"
              onChange={(e) =>
                setForm({ ...form, invoicePrefix: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receiptFooter">Receipt footer</Label>
            <Input
              id="receiptFooter"
              value={form.receiptFooter ?? ""}
              onChange={(e) =>
                setForm({ ...form, receiptFooter: e.target.value })
              }
            />
          </div>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setMsg(null)
              void SettingsService.saveStoreSettings(storeId, form, userId)
                .then((saved) => {
                  setForm(saved)
                  setMsg("Saved.")
                })
                .catch((err) =>
                  setMsg(err instanceof Error ? err.message : "Save failed.")
                )
                .finally(() => setBusy(false))
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      <Link
        to="/utilities/business-setup"
        className={buttonVariants({ variant: "outline" })}
      >
        Open Business Setup
      </Link>
    </div>
  )
}
