import { useEffect, useState } from "react"
import { CloudUpload, Settings2 } from "lucide-react"

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
import { Separator } from "@/components/ui/separator"
import {
  StoreSettingsService,
  type StoreSettingsRecord,
} from "@/modules/notifications"
import {
  EndOfDayService,
  type EndOfDayDay,
  type EndOfDayResult,
} from "@/modules/reports"
import { SettingsService } from "@/modules/settings/SettingsService"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

export function OptionsPage() {
  const { profile, userId } = useAuth()
  const [day, setDay] = useState<EndOfDayDay>("today")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EndOfDayResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRun] = useState(() => EndOfDayService.getLastRun())
  const [storeForm, setStoreForm] = useState<StoreSettingsRecord | null>(null)
  const [storeBusy, setStoreBusy] = useState(false)
  const [storeMsg, setStoreMsg] = useState<string | null>(null)

  const sheetsConfigured = EndOfDayService.isSheetsConfigured()
  const scriptUrl = SettingsService.getGoogleScriptUrl()
  const storeId = profile?.storeId || "store-1"

  useEffect(() => {
    let cancelled = false
    void StoreSettingsService.get(storeId).then((settings) => {
      if (!cancelled) setStoreForm(settings)
    })
    return () => {
      cancelled = true
    }
  }, [storeId])

  async function runEndOfDay() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const next = await EndOfDayService.run(day, profile?.storeId ?? null)
      setResult(next)
      if (next.errors.length > 0 && next.invoicesSynced === 0) {
        setError(next.errors[0] ?? "End of day sync failed.")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "End of day sync failed."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Settings2 className="size-6" />
          Admin Options
        </h1>
        <p className="text-sm text-muted-foreground">
          Store close-out and sync controls. Sales, payments, refunds, and
          customers sync to Google Sheets when you run End of Day — not on every
          transaction.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">End of day</CardTitle>
          <CardDescription>
            Push the selected day&apos;s invoices, payments, refunds, customers,
            and a DailyClose summary to Google Sheets in one run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Day to sync</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDay(option.id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    day === option.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
            <p className="font-medium">Sheets status</p>
            <p className="mt-1 text-muted-foreground">
              {sheetsConfigured
                ? "Google Sheets webhook is configured."
                : "Not configured — set VITE_GOOGLE_SCRIPT_URL in .env."}
            </p>
            {scriptUrl ? (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {scriptUrl}
              </p>
            ) : null}
            {(result?.ranAt ? result : lastRun) ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Last run:{" "}
                {new Date(
                  (result ?? lastRun)!.ranAt
                ).toLocaleString("en-IN")}{" "}
                · {(result ?? lastRun)!.dayLabel}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No End of Day run recorded yet on this device.
              </p>
            )}
          </div>

          <Button
            type="button"
            size="lg"
            disabled={busy}
            onClick={() => void runEndOfDay()}
          >
            <CloudUpload data-icon="inline-start" />
            {busy ? "Syncing…" : "End of day"}
          </Button>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {result && result.sheetsConfigured ? (
            <div className="rounded-lg border border-border px-3 py-3 text-sm">
              <p className="font-medium">Sync complete · {result.dayLabel}</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>Invoices: {result.invoicesSynced}</li>
                <li>Payments: {result.paymentsSynced}</li>
                <li>Refunds: {result.refundsSynced}</li>
                <li>Customers: {result.customersSynced}</li>
                <li>
                  DailyClose summary:{" "}
                  {result.summarySynced ? "sent" : "not sent"}
                </li>
              </ul>
              {result.errors.length > 0 ? (
                <div className="mt-2 text-destructive">
                  {result.errors.map((msg) => (
                    <p key={msg}>{msg}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Check your Google Sheet tabs: Invoices, Payments, Refunds,
                  Customers, DailyClose.
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Store settings</CardTitle>
          <CardDescription>
            Branding and public WhatsApp details used on receipts. Access
            tokens stay in Cloud Functions env — never in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {storeForm ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["businessName", "Business name"],
                  ["whatsappBusinessNumber", "WhatsApp business number"],
                  ["phoneNumberId", "Phone number ID (public)"],
                  ["supportNumber", "Support number"],
                  ["businessAddress", "Business address"],
                  ["storeGst", "Store GST"],
                  ["businessLogoUrl", "Business logo URL"],
                  ["receiptFooter", "Receipt footer"],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  className={
                    key === "businessAddress" || key === "receiptFooter"
                      ? "space-y-1.5 sm:col-span-2"
                      : "space-y-1.5"
                  }
                >
                  <Label htmlFor={`store-${key}`}>{label}</Label>
                  <Input
                    id={`store-${key}`}
                    value={String(storeForm[key] ?? "")}
                    onChange={(event) =>
                      setStoreForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              [key]: event.target.value,
                            }
                          : prev
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {storeMsg ? (
            <p className="text-sm text-muted-foreground">{storeMsg}</p>
          ) : null}
          <Button
            type="button"
            disabled={!storeForm || storeBusy}
            onClick={() => {
              if (!storeForm) return
              setStoreBusy(true)
              setStoreMsg(null)
              void StoreSettingsService.save(storeId, storeForm, userId)
                .then((saved) => {
                  setStoreForm(saved)
                  setStoreMsg("Store settings saved.")
                })
                .catch((err) => {
                  setStoreMsg(
                    err instanceof Error ? err.message : "Save failed."
                  )
                })
                .finally(() => setStoreBusy(false))
            }}
          >
            {storeBusy ? "Saving…" : "Save store settings"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">What still syncs live</p>
        <p>
          Inventory and product catalog changes still sync to Sheets as they
          happen. Day sales reports wait for End of Day so the sheet stays
          clean and complete.
        </p>
      </div>
    </div>
  )
}
