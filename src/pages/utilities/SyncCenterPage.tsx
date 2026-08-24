import { useEffect, useMemo, useState } from "react"
import { CloudOff, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { cn } from "@/lib/utils"
import { useOnlineStatus } from "@/hooks/useOnlineStatus"
import {
  SyncService,
  type SyncCenterSnapshot,
} from "@/services/sync/SyncService"
import type { SyncQueueItem } from "@/services/sync/SyncQueue"
import { IncompleteSalesPanel } from "@/modules/saleTransaction"

function formatWhen(iso: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return iso
  }
}

function statusTone(status: string) {
  if (status === "DeadLetter" || status === "Failed") {
    return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-50"
  }
  if (status === "Retrying" || status === "Syncing") {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-50"
  }
  if (status === "Completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-50"
  }
  return "border-border bg-muted/40 text-foreground"
}

type Tab = "pending" | "failed" | "dead" | "recent"

/**
 * Utilities → Sync Center — queue health, dead letters, retry, view error.
 */
export function SyncCenterPage() {
  const online = useOnlineStatus()
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<Tab>("pending")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [errorItem, setErrorItem] = useState<SyncQueueItem | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const snapshot: SyncCenterSnapshot = useMemo(() => {
    void tick
    return SyncService.getSnapshot()
  }, [tick])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 4000)
    const onStorage = () => setTick((t) => t + 1)
    window.addEventListener("storage", onStorage)
    return () => {
      window.clearInterval(id)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const rows = useMemo(() => {
    const source =
      tab === "pending"
        ? snapshot.pending
        : tab === "failed"
          ? snapshot.failed
          : tab === "dead"
            ? snapshot.deadLetter
            : snapshot.completedRecent
    const q = query.trim().toLowerCase()
    if (!q) return source
    return source.filter(
      (item) =>
        item.eventType.toLowerCase().includes(q) ||
        item.sheet.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.idempotencyKey || "").toLowerCase().includes(q) ||
        (item.error || "").toLowerCase().includes(q)
    )
  }, [snapshot, tab, query])

  async function run(
    action: () => unknown | Promise<unknown>,
    ok: string
  ) {
    setBusy(true)
    setMsg(null)
    try {
      await action()
      setMsg(ok)
      setTick((t) => t + 1)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert className="size-6" />
            Sync Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offline queue health — pending, failed, dead letter, retry, and
            errors. Payments use stable ids so network retries do not double-post.
            Incomplete sales below track checkout boundaries when payment or
            stock fan-out stops mid-way.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !online}
            onClick={() =>
              void run(() => SyncService.processNow(), "Queue drain started.")
            }
          >
            <RefreshCw data-icon="inline-start" />
            Process now
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || snapshot.deadLetter.length === 0}
            onClick={() =>
              void run(
                () => SyncService.retryAllDeadLetters(),
                "Dead letters requeued."
              )
            }
          >
            <RotateCcw data-icon="inline-start" />
            Retry all dead
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Last successful sync"
          value={formatWhen(snapshot.lastSuccessfulSyncAt)}
        />
        <Stat label="Pending" value={String(snapshot.counts.pending)} />
        <Stat label="Failed / retrying" value={String(snapshot.counts.failed)} />
        <Stat
          label="Dead letter"
          value={String(snapshot.counts.deadLetter)}
          tone={snapshot.counts.deadLetter > 0 ? "rose" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "rounded-md border px-2 py-1",
            online
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          )}
        >
          {online ? "Online" : "Offline"}
        </span>
        <span className="rounded-md border border-border px-2 py-1">
          Sheets{" "}
          {snapshot.sheetsConfigured ? "configured" : "not configured"}
        </span>
        {snapshot.eodLastRunAt ? (
          <span className="rounded-md border border-border px-2 py-1">
            EOD last run {formatWhen(snapshot.eodLastRunAt)}
          </span>
        ) : null}
        {!online ? (
          <span className="inline-flex items-center gap-1 text-rose-700">
            <CloudOff className="size-3.5" /> Queue drains when back online
          </span>
        ) : null}
      </div>

      <IncompleteSalesPanel onChanged={() => setTick((t) => t + 1)} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["pending", `Pending (${snapshot.counts.pending})`],
            ["failed", `Failed (${snapshot.counts.failed})`],
            ["dead", `Dead letter (${snapshot.counts.deadLetter})`],
            ["recent", "Recent completed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              tab === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="sync-q">Search</Label>
        <Input
          id="sync-q"
          placeholder="Sheet, event, key, error…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <ResponsiveList
        cards={
          rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
              Nothing in this list.
            </p>
          ) : (
            rows.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                busy={busy}
                onViewError={() => setErrorItem(item)}
                onRetry={
                  item.status === "DeadLetter"
                    ? () =>
                        void run(
                          () => SyncService.retryDeadLetter(item.id),
                          "Requeued."
                        )
                    : undefined
                }
              />
            ))
          )
        }
        table={
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Retries</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatWhen(item.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                          statusTone(item.status)
                        )}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.sheet}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {item.eventType}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {item.idempotencyKey || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{item.retries}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {item.error ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setErrorItem(item)}
                          >
                            View error
                          </Button>
                        ) : null}
                        {item.status === "DeadLetter" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => SyncService.retryDeadLetter(item.id),
                                "Requeued."
                              )
                            }
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      Nothing in this list.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
      />

      <Dialog
        open={Boolean(errorItem)}
        onOpenChange={(open) => {
          if (!open) setErrorItem(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync error</DialogTitle>
          </DialogHeader>
          {errorItem ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Item · </span>
                <span className="font-mono text-xs">{errorItem.id}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Event · </span>
                {errorItem.eventType} → {errorItem.sheet}
              </p>
              {errorItem.idempotencyKey ? (
                <p>
                  <span className="text-muted-foreground">Key · </span>
                  <span className="font-mono text-xs">
                    {errorItem.idempotencyKey}
                  </span>
                </p>
              ) : null}
              <pre className="max-h-60 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                {errorItem.error || "No error message stored."}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setErrorItem(null)}>
              Close
            </Button>
            {errorItem?.status === "DeadLetter" ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  const id = errorItem.id
                  setErrorItem(null)
                  void run(
                    () => SyncService.retryDeadLetter(id),
                    "Requeued."
                  )
                }}
              >
                Retry
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "rose"
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        tone === "rose"
          ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
          : "border-border bg-card"
      )}
    >
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function QueueCard({
  item,
  busy,
  onViewError,
  onRetry,
}: {
  item: SyncQueueItem
  busy: boolean
  onViewError: () => void
  onRetry?: () => void
}) {
  return (
    <MobileListCard
      title={`${item.sheet} · ${item.eventType}`}
      meta={
        <>
          <div>{formatWhen(item.updatedAt)}</div>
          <div className="font-mono text-[11px]">
            {item.idempotencyKey || item.id}
          </div>
          {item.error ? (
            <div className="line-clamp-2 text-rose-700 dark:text-rose-300">
              {item.error}
            </div>
          ) : null}
        </>
      }
      badge={
        <span
          className={cn(
            "rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase",
            statusTone(item.status)
          )}
        >
          {item.status}
        </span>
      }
      actions={
        <>
          {item.error ? (
            <Button type="button" size="sm" variant="ghost" onClick={onViewError}>
              View error
            </Button>
          ) : null}
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </>
      }
    />
  )
}
