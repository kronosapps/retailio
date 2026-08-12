import { useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SettingsService, type PosSettings } from "@/modules/settings"

export function SettingsPosPage() {
  const [form, setForm] = useState<PosSettings>(() =>
    SettingsService.getPosSettings()
  )
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">POS</h2>
        <p className="text-sm text-muted-foreground">
          Checkout behaviour. Lanes are in-memory session tabs (currently fixed
          at 3) — not database entities.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div>
            <Label>Require open business day</Label>
            <p className="text-xs text-muted-foreground">
              When on, charging with a closed day shows a confirm gate.
            </p>
          </div>
          <Switch
            checked={form.requireDayOpen}
            onCheckedChange={(v) => setForm({ ...form, requireDayOpen: v })}
          />
        </div>
        <p className="text-sm text-muted-foreground">{form.laneCountNote}</p>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button
          type="button"
          onClick={() => {
            const saved = SettingsService.savePosSettings(form)
            setForm(saved)
            setMsg("POS settings saved.")
          }}
        >
          Save
        </Button>
      </div>

      <Link to="/pos" className={buttonVariants({ variant: "outline" })}>
        Open POS
      </Link>
    </div>
  )
}
