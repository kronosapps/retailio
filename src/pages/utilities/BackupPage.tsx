import { useMemo, useRef, useState } from "react"
import { Archive, Download, ShieldAlert, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  BACKUP_KIND_DESCRIPTIONS,
  BACKUP_KIND_LABELS,
  BackupService,
  RestoreService,
  type BackupKind,
  type RestoreInspection,
} from "@/modules/backup"
import { isAdmin } from "@/modules/staff/permissions"
import { useAuth } from "@/providers/AuthProvider"

const EXPORT_KINDS: BackupKind[] = [
  "database",
  "products",
  "customers",
  "invoices",
  "inventory",
  "accounting",
  "full_business",
]

/**
 * Utilities → Backup & Recovery — admin-only local snapshots.
 * Sheets is never used as a backup target.
 */
export function BackupPage() {
  const { profile, role, userId } = useAuth()
  const [busyKind, setBusyKind] = useState<BackupKind | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [inspect, setInspect] = useState<RestoreInspection | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const admin = isAdmin(role)

  const actor = useMemo(
    () => ({
      actorId: userId,
      actorName: profile?.displayName || profile?.email || null,
      storeId: profile?.storeId ?? null,
      storeName: profile?.storeId ?? "Store",
    }),
    [userId, profile]
  )

  if (!admin) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center dark:border-rose-900/40 dark:bg-rose-950/30">
        <ShieldAlert className="mx-auto size-8 text-rose-700" />
        <h1 className="mt-3 text-lg font-semibold">Admin only</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Backup &amp; Recovery is restricted to administrators.
        </p>
      </div>
    )
  }

  async function runExport(kind: BackupKind) {
    setBusyKind(kind)
    setMsg(null)
    try {
      await BackupService.run(kind, actor)
      setMsg(`${BACKUP_KIND_LABELS[kind]} downloaded.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Export failed.")
    } finally {
      setBusyKind(null)
    }
  }

  function onPickFile(file: File | null) {
    setInspect(null)
    setMsg(null)
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || "")
      const result = RestoreService.inspectJsonText(text)
      setInspect(result)
      if (!result.ok) {
        setMsg(result.error || "Could not read backup.")
      } else {
        setMsg(
          "Backup file inspected. Restore apply is disabled until the recovery writer ships."
        )
      }
    }
    reader.onerror = () => setMsg("Could not read file.")
    reader.readAsText(file)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Archive className="size-6" />
          Backup &amp; Recovery
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download source-of-truth snapshots from Firestore + local cache.
          Google Sheets remains sync/reporting only — never treat it as the
          backup database.
        </p>
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Backup</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXPORT_KINDS.map((kind) => (
            <div
              key={kind}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4"
            >
              <div>
                <p className="font-medium">{BACKUP_KIND_LABELS[kind]}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {BACKUP_KIND_DESCRIPTIONS[kind]}
                </p>
              </div>
              <Button
                type="button"
                variant={kind === "full_business" ? "default" : "outline"}
                disabled={busyKind !== null}
                onClick={() => void runExport(kind)}
              >
                <Download data-icon="inline-start" />
                {busyKind === kind ? "Preparing…" : "Download"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Upload className="size-4" />
              Restore
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin-only. You can inspect a JSON backup today; applying a
              restore is intentionally blocked until merge/replace rules are
              safe (journals are append-only; sales must stay idempotent).
            </p>
          </div>
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-[10px] font-medium uppercase",
              "border-amber-300 bg-amber-100 text-amber-950"
            )}
          >
            Inspect only
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            Choose backup JSON
          </Button>
          <Button type="button" disabled title="Restore writer not enabled">
            Apply restore (disabled)
          </Button>
        </div>

        {inspect ? (
          <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <p>
              <span className="text-muted-foreground">Status · </span>
              {inspect.ok ? "Readable" : "Invalid"}
            </p>
            <p>
              <span className="text-muted-foreground">Kind · </span>
              {inspect.kind || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Exported · </span>
              {inspect.exportedAt || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Store · </span>
              {inspect.storeId || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Format · </span>
              {inspect.formatVersion ?? "—"}
            </p>
            <p className="mt-2 text-muted-foreground">
              Sections:{" "}
              {inspect.collectionKeys.length
                ? inspect.collectionKeys.join(", ")
                : "—"}
            </p>
            {inspect.error ? (
              <p className="mt-2 text-rose-700 dark:text-rose-300">
                {inspect.error}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              canApply: {String(inspect.canApply)}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
