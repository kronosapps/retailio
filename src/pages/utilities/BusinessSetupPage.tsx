import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { BusinessSetupService } from "@/modules/utilities"
import type { StoreSettingsRecord } from "@/modules/notifications/types/notification"
import { useAuth } from "@/providers/AuthProvider"

export function BusinessSetupPage() {
  const { profile, userId } = useAuth()
  const storeId = profile?.storeId || "store-1"
  const [form, setForm] = useState<Partial<StoreSettingsRecord>>({})
  const [envNote, setEnvNote] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void BusinessSetupService.get(storeId).then((view) => {
      setForm({
        ...view.settings,
        legalName: view.settings.legalName || view.envDefaults.legalName,
        tradeName: view.settings.tradeName || view.envDefaults.tradeName,
        storeGst: view.settings.storeGst || view.envDefaults.gstin,
        businessAddress:
          view.settings.businessAddress || view.bankingGst.address,
      })
      setEnvNote(
        `Banking/GST env defaults: ${view.envDefaults.tradeName} · ${view.envDefaults.gstin}`
      )
    })
  }, [storeId])

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await BusinessSetupService.save(storeId, form, userId)
      setMsg("Business setup saved.")
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.")
    } finally {
      setBusy(false)
    }
  }

  function set<K extends keyof StoreSettingsRecord>(
    key: K,
    value: StoreSettingsRecord[K]
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">Business Setup</h2>
      <p className="text-sm text-muted-foreground">{envNote}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trade / Business name">
          <Input
            value={form.businessName || ""}
            onChange={(e) => set("businessName", e.target.value)}
          />
        </Field>
        <Field label="Trade name (DBA)">
          <Input
            value={form.tradeName || ""}
            onChange={(e) => set("tradeName", e.target.value)}
          />
        </Field>
        <Field label="Legal name">
          <Input
            value={form.legalName || ""}
            onChange={(e) => set("legalName", e.target.value)}
          />
        </Field>
        <Field label="Business type">
          <Input
            value={form.businessType || ""}
            onChange={(e) => set("businessType", e.target.value)}
            placeholder="e.g. Proprietorship"
          />
        </Field>
        <Field label="GSTIN">
          <Input
            value={form.storeGst || ""}
            onChange={(e) => set("storeGst", e.target.value)}
          />
        </Field>
        <Field label="GST registration type">
          <Input
            value={form.gstRegistrationType || ""}
            onChange={(e) => set("gstRegistrationType", e.target.value)}
            placeholder="e.g. Regular / Composition"
          />
        </Field>
        <Field label="PAN">
          <Input
            value={form.pan || ""}
            onChange={(e) => set("pan", e.target.value)}
          />
        </Field>
        <Field label="TAN">
          <Input
            value={form.tan || ""}
            onChange={(e) => set("tan", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.supportNumber || ""}
            onChange={(e) => set("supportNumber", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input
            value={form.email || ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Website">
          <Input
            value={form.website || ""}
            onChange={(e) => set("website", e.target.value)}
          />
        </Field>
        <Field label="Country">
          <Input
            value={form.country || ""}
            onChange={(e) => set("country", e.target.value)}
            placeholder="India"
          />
        </Field>
        <Field label="City">
          <Input
            value={form.city || ""}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>
        <Field label="State">
          <Input
            value={form.state || ""}
            onChange={(e) => set("state", e.target.value)}
          />
        </Field>
        <Field label="PIN">
          <Input
            value={form.pin || ""}
            onChange={(e) => set("pin", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <Input
              value={form.businessAddress || ""}
              onChange={(e) => set("businessAddress", e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Receipt footer">
            <Input
              value={form.receiptFooter || ""}
              onChange={(e) => set("receiptFooter", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Invoice prefix">
          <Input
            value={form.invoicePrefix || ""}
            onChange={(e) => set("invoicePrefix", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(form.tcsApplicable)}
            onChange={(e) => set("tcsApplicable", e.target.checked)}
          />
          TCS applicable (scaffold flag for statutory tools)
        </label>
      </div>
      <Separator />
      <Button type="button" disabled={busy} onClick={() => void save()}>
        Save
      </Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
