import { useState } from "react"
import { Link } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  SettingsService,
  type InventorySettings,
} from "@/modules/settings"

export function SettingsInventoryPage() {
  const [form, setForm] = useState<InventorySettings>(() =>
    SettingsService.getInventorySettings()
  )
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Inventory</h2>
        <p className="text-sm text-muted-foreground">
          Store-wide default reorder level when a SKU has none set. Per-product
          levels still win on{" "}
          <Link to="/inventory/items" className="underline">
            Inventory → Items
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="defaultReorderLevel">Default reorder level</Label>
          <Input
            id="defaultReorderLevel"
            type="number"
            min={0}
            value={form.defaultReorderLevel}
            onChange={(e) =>
              setForm({
                ...form,
                defaultReorderLevel: Number(e.target.value),
              })
            }
          />
        </div>
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button
          type="button"
          onClick={() => {
            const saved = SettingsService.saveInventorySettings(form)
            setForm(saved)
            setMsg("Inventory settings saved.")
          }}
        >
          Save
        </Button>
      </div>

      <Link
        to="/inventory/items"
        className={buttonVariants({ variant: "outline" })}
      >
        Open inventory items
      </Link>
    </div>
  )
}
