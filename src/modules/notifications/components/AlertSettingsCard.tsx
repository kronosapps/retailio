import { useEffect, useState } from "react"
import { BellRing } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/user"
import {
  defaultAlertThresholds,
  getAlertThresholds,
  saveAlertThresholds,
  type AlertThresholds,
} from "../alertThresholds"
import {
  ALERT_MESSAGE_TYPES,
  alertLabel,
  type NotificationMessageType,
} from "../types/notification"

function paisaToRupeeInput(paisa: number): string {
  return String(Math.round(paisa) / 100)
}

function rupeeInputToPaisa(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

const ROLE_ORDER: UserRole[] = ["cashier", "manager", "admin"]

/**
 * Admin Options card — thresholds, digest, Telegram night phone, role mutes.
 */
export function AlertSettingsCard() {
  const [form, setForm] = useState<AlertThresholds>(() => getAlertThresholds())
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setForm(getAlertThresholds())
  }, [])

  function patch(partial: Partial<AlertThresholds>) {
    setForm((prev) => ({ ...prev, ...partial }))
    setMsg(null)
  }

  function toggleMute(role: UserRole, type: NotificationMessageType) {
    const current = form.roleMutes[role] || []
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type]
    patch({
      roleMutes: {
        ...form.roleMutes,
        [role]: next,
      },
    })
  }

  function save() {
    const saved = saveAlertThresholds(form)
    setForm(saved)
    setMsg("Alert settings saved on this device.")
  }

  function resetDefaults() {
    const defaults = defaultAlertThresholds()
    setForm(defaults)
    saveAlertThresholds(defaults)
    setMsg("Restored default alert settings.")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4" />
          Staff alerts
        </CardTitle>
        <CardDescription>
          Soft inbox thresholds, low-stock digest, role mutes, and optional
          Telegram for critical night-phone alerts. Bot token stays in Cloud
          Functions — only the chat id is stored here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="largeDiscountRatio"
            label="Large discount ratio (0–1)"
            value={String(form.largeDiscountRatio)}
            onChange={(v) =>
              patch({
                largeDiscountRatio: Math.min(
                  1,
                  Math.max(0, Number(v) || 0)
                ),
              })
            }
          />
          <Field
            id="largeDiscountMin"
            label="Large discount min (₹)"
            value={paisaToRupeeInput(form.largeDiscountMinPaisa)}
            onChange={(v) =>
              patch({ largeDiscountMinPaisa: rupeeInputToPaisa(v) })
            }
          />
          <Field
            id="largeRefundMin"
            label="Large refund min (₹)"
            value={paisaToRupeeInput(form.largeRefundMinPaisa)}
            onChange={(v) =>
              patch({ largeRefundMinPaisa: rupeeInputToPaisa(v) })
            }
          />
          <Field
            id="cashVarianceMin"
            label="Cash variance min (₹)"
            value={paisaToRupeeInput(form.cashVarianceMinPaisa)}
            onChange={(v) =>
              patch({ cashVarianceMinPaisa: rupeeInputToPaisa(v) })
            }
          />
          <Field
            id="customerOutstanding"
            label="Customer outstanding min (₹)"
            value={paisaToRupeeInput(form.customerOutstandingMinPaisa)}
            onChange={(v) =>
              patch({ customerOutstandingMinPaisa: rupeeInputToPaisa(v) })
            }
          />
          <Field
            id="supplierOutstanding"
            label="Supplier outstanding min (₹)"
            value={paisaToRupeeInput(form.supplierOutstandingMinPaisa)}
            onChange={(v) =>
              patch({ supplierOutstandingMinPaisa: rupeeInputToPaisa(v) })
            }
          />
          <Field
            id="expiryDays"
            label="Expiry window (days)"
            value={String(form.expiryWithinDays)}
            onChange={(v) =>
              patch({
                expiryWithinDays: Math.max(1, Math.round(Number(v) || 1)),
              })
            }
          />
          <Field
            id="dedupeHours"
            label="Dedupe window (hours)"
            value={String(Math.round(form.dedupeWindowMs / 3_600_000))}
            onChange={(v) =>
              patch({
                dedupeWindowMs:
                  Math.max(1, Math.round(Number(v) || 1)) * 3_600_000,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
          <ToggleRow
            label="Low-stock digest"
            description="One daily card instead of per-SKU low stock (out of stock stays urgent)."
            checked={form.lowStockDigest}
            onCheckedChange={(checked) => patch({ lowStockDigest: checked })}
          />
          <ToggleRow
            label="Telegram critical alerts"
            description="Queue night-phone messages when priority is critical."
            checked={form.telegramCriticalEnabled}
            onCheckedChange={(checked) =>
              patch({ telegramCriticalEnabled: checked })
            }
          />
          <div className="space-y-1.5">
            <Label htmlFor="telegramChatId">Telegram chat id</Label>
            <Input
              id="telegramChatId"
              placeholder="-100… or user chat id"
              value={form.telegramChatId}
              onChange={(e) => patch({ telegramChatId: e.target.value.trim() })}
              disabled={!form.telegramCriticalEnabled}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Role mutes</p>
            <p className="text-xs text-muted-foreground">
              Muted types stay raised for audit but are hidden in that role’s
              bell.
            </p>
          </div>
          {ROLE_ORDER.map((role) => (
            <div key={role} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold tracking-wide uppercase">
                {role}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALERT_MESSAGE_TYPES.map((type) => {
                  const muted = (form.roleMutes[role] || []).includes(type)
                  return (
                    <button
                      key={`${role}-${type}`}
                      type="button"
                      onClick={() => toggleMute(role, type)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] transition-colors",
                        muted
                          ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-50"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {alertLabel(type)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save}>
            Save alert settings
          </Button>
          <Button type="button" variant="outline" onClick={resetDefaults}>
            Reset defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
