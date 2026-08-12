import { useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { GST_SLAB_RATES } from "@/data/gstSettings"
import { SettingsService } from "@/modules/settings"
import type { GstSettings } from "@/data/gstSettings"

/** Tax / GST runtime settings (store local — not env). */
export function SettingsTaxPage() {
  const [form, setForm] = useState<GstSettings>(() =>
    SettingsService.getGstSettings()
  )
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Tax</h2>
        <p className="text-sm text-muted-foreground">
          Runtime GST mode for POS pricing. Statutory reports and scaffolds stay
          under{" "}
          <Link to="/utilities/gst" className="underline">
            Utilities → GST
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="pricingMode">Pricing mode</Label>
          <select
            id="pricingMode"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={form.pricingMode}
            onChange={(e) =>
              setForm({
                ...form,
                pricingMode: e.target.value as GstSettings["pricingMode"],
              })
            }
          >
            <option value="INCLUSIVE">Inclusive (MRP includes GST)</option>
            <option value="EXCLUSIVE">Exclusive (add GST at checkout)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaultGstRate">Default GST rate %</Label>
          <select
            id="defaultGstRate"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={form.defaultGstRate}
            onChange={(e) =>
              setForm({ ...form, defaultGstRate: Number(e.target.value) })
            }
          >
            {GST_SLAB_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="storeStateCode">Store state code</Label>
            <Input
              id="storeStateCode"
              maxLength={2}
              value={form.storeStateCode}
              placeholder="36"
              onChange={(e) =>
                setForm({ ...form, storeStateCode: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defaultPlaceOfSupply">Default place of supply</Label>
            <Input
              id="defaultPlaceOfSupply"
              maxLength={2}
              value={form.defaultPlaceOfSupply}
              onChange={(e) =>
                setForm({ ...form, defaultPlaceOfSupply: e.target.value })
              }
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="storeGstin">Store GSTIN</Label>
          <Input
            id="storeGstin"
            value={form.storeGstin}
            onChange={(e) => setForm({ ...form, storeGstin: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="storeLegalName">Legal name (GST)</Label>
          <Input
            id="storeLegalName"
            value={form.storeLegalName}
            onChange={(e) =>
              setForm({ ...form, storeLegalName: e.target.value })
            }
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Composition dealer</p>
            <p className="text-xs text-muted-foreground">
              Scaffold flag for bill-of-supply style bills.
            </p>
          </div>
          <Switch
            checked={form.compositionDealer}
            onCheckedChange={(v) => setForm({ ...form, compositionDealer: v })}
          />
        </div>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button
          type="button"
          onClick={() => {
            const saved = SettingsService.saveGstSettings(form)
            setForm(saved)
            setMsg("Tax settings saved.")
          }}
        >
          Save
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/utilities/gst"
          className={buttonVariants({ variant: "outline" })}
        >
          GST reports
        </Link>
        <Link
          to="/utilities/master-data/tax-rates"
          className={buttonVariants({ variant: "outline" })}
        >
          Tax rates master
        </Link>
      </div>
    </div>
  )
}
