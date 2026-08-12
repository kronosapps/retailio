import { useState } from "react"
import { Link } from "react-router-dom"
import { CloudUpload } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { DayOpsService } from "@/modules/dayOps"
import {
  EndOfDayService,
  type EndOfDayDay,
  type EndOfDayResult,
} from "@/modules/reports"
import { SettingsService } from "@/modules/settings"
import { useAuth } from "@/providers/AuthProvider"

/**
 * Integrations — env status (read-only) + Sheets day sync ops.
 */
export function SettingsIntegrationsPage() {
  const { profile } = useAuth()
  const status = SettingsService.getEnvIntegrationStatus()
  const scriptUrl = SettingsService.getGoogleScriptUrl()
  const [day, setDay] = useState<EndOfDayDay>("today")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<EndOfDayResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRun] = useState(() => EndOfDayService.getLastRun())

  async function runSheetsSync() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const next = await DayOpsService.syncSheetsOnly(
        day,
        profile?.storeId ?? null
      )
      setResult(next)
      if (next.errors.length > 0 && next.invoicesSynced === 0) {
        setError(next.errors[0] ?? "Sheets sync failed.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sheets sync failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Deploy-time URLs come from{" "}
          <code className="text-xs">src/core/config/env.ts</code> /{" "}
          <code className="text-xs">.env</code>. Edit hosting config — not this
          form.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-4 text-sm">
        <p className="font-medium">Environment status</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>Store id (env default): {status.storeId}</li>
          <li>
            Firebase:{" "}
            {status.firebaseConfigured ? "configured" : "not configured"}
          </li>
          <li>
            Google Sheets script:{" "}
            {status.googleScriptConfigured ? "configured" : "missing"}
          </li>
          <li>
            WhatsApp webhook:{" "}
            {status.whatsappWebhookConfigured ? "configured" : "missing"}
          </li>
          <li>Banking account (env): {status.bankingAccountName}</li>
          <li>Banking GSTIN (env): {status.bankingGstin}</li>
        </ul>
        {scriptUrl ? (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {scriptUrl}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Set <code>VITE_GOOGLE_SCRIPT_URL</code> to enable Sheets sync.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
        <div>
          <p className="font-medium">Sheets day sync</p>
          <p className="text-sm text-muted-foreground">
            Re-push invoices, payments, refunds, customers, and DailyClose for
            the selected day. Day close itself lives on{" "}
            <Link to="/day-ops" className="underline">
              Day Ops
            </Link>
            .
          </p>
        </div>
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
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void runSheetsSync()}
        >
          <CloudUpload data-icon="inline-start" />
          {busy ? "Syncing…" : "Sync day to Sheets"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {(result?.ranAt ? result : lastRun) ? (
          <p className="text-xs text-muted-foreground">
            Last run:{" "}
            {new Date((result ?? lastRun)!.ranAt).toLocaleString("en-IN")} ·{" "}
            {(result ?? lastRun)!.dayLabel}
          </p>
        ) : null}
        {result?.sheetsConfigured ? (
          <ul className="text-sm text-muted-foreground">
            <li>Invoices: {result.invoicesSynced}</li>
            <li>Payments: {result.paymentsSynced}</li>
            <li>Refunds: {result.refundsSynced}</li>
            <li>Customers: {result.customersSynced}</li>
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/utilities/sync"
          className={buttonVariants({ variant: "outline" })}
        >
          Sync Center
        </Link>
        <Link
          to="/utilities/backup"
          className={buttonVariants({ variant: "outline" })}
        >
          Backup &amp; Recovery
        </Link>
      </div>
    </div>
  )
}
