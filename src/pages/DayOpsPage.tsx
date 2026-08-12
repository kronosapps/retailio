import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  CalendarCheck,
  FileSpreadsheet,
  Lock,
  Printer,
  Sunrise,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatMoney, rupeesToPaisa } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  DayOpsError,
  DayOpsExportService,
  DayOpsService,
  type BusinessDayRecord,
  type DayClosingPreview,
  type DayOpsDayRef,
  type SodChecklist,
} from "@/modules/dayOps"
import { ShiftError, ShiftService } from "@/modules/shift"
import { useAuth } from "@/providers/AuthProvider"
import { isAdmin } from "@/modules/staff/permissions"

function money(p: number) {
  return formatMoney(p)
}

/**
 * Store day ops — Open Day → Operations preview → Close Day.
 */
export function DayOpsPage() {
  const { profile, userId, role } = useAuth()
  const storeId = profile?.storeId ?? null
  const [dayRef, setDayRef] = useState<DayOpsDayRef>("today")
  const [openDay, setOpenDay] = useState<BusinessDayRecord | null>(null)
  const [history, setHistory] = useState<BusinessDayRecord[]>([])
  const [preview, setPreview] = useState<DayClosingPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const suggested = useMemo(
    () => DayOpsService.getSuggestedOpenings(storeId),
    // refresh after open/close
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeId, openDay?.id, history.length]
  )

  const [openNotes, setOpenNotes] = useState("")
  const [openingCashRupees, setOpeningCashRupees] = useState("")
  const [openingUpiRupees, setOpeningUpiRupees] = useState("")
  const [checklist, setChecklist] = useState<SodChecklist>({
    bankingVerified: false,
    floatReady: false,
    printersOk: false,
    upiQrOk: false,
  })

  const [closeNotes, setCloseNotes] = useState("")
  const [countedCash, setCountedCash] = useState("")
  const [allowOpenShifts, setAllowOpenShifts] = useState(false)
  const [syncSheets, setSyncSheets] = useState(true)
  const [shiftActuals, setShiftActuals] = useState<Record<string, string>>({})
  const [reopenReason, setReopenReason] = useState("")

  async function refresh() {
    setOpenDay(DayOpsService.getOpen(storeId))
    setHistory(DayOpsService.list(storeId).slice(0, 10))
    const p = await DayOpsService.getClosingPreview(dayRef, storeId)
    setPreview(p)
  }

  useEffect(() => {
    void DayOpsService.hydrate().then(() => {
      const s = DayOpsService.getSuggestedOpenings(storeId)
      setOpeningCashRupees(DayOpsService.paisaToRupeesInput(s.cashPaisa))
      setOpeningUpiRupees(DayOpsService.paisaToRupeesInput(s.upiPaisa))
      return refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dayRef])

  async function onOpenDay() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const cash = Number(openingCashRupees)
      const upi = Number(openingUpiRupees)
      if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(upi) || upi < 0) {
        throw new DayOpsError("VALIDATION", "Opening cash/UPI must be ≥ 0.")
      }
      const day = await DayOpsService.openDay({
        storeId,
        actorId: userId,
        actorName: profile?.displayName || profile?.email || null,
        notes: openNotes || null,
        openingCashPaisa: rupeesToPaisa(cash),
        openingUpiPaisa: rupeesToPaisa(upi),
        checklist,
      })
      setMsg(`Opened ${day.date}`)
      setOpenNotes("")
      await refresh()
    } catch (err) {
      setError(
        err instanceof DayOpsError || err instanceof Error
          ? err.message
          : "Could not open day."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onCloseShift(shiftId: string, cashierId: string) {
    setBusy(true)
    setError(null)
    try {
      const raw = shiftActuals[shiftId] ?? ""
      const rupees = Number(raw)
      if (!Number.isFinite(rupees) || rupees < 0) {
        throw new DayOpsError("VALIDATION", "Enter counted drawer cash (₹).")
      }
      await ShiftService.close({
        shiftId,
        cashierId,
        actualCashRupees: rupees,
        actorId: userId,
      })
      setMsg("Shift closed.")
      await refresh()
    } catch (err) {
      setError(
        err instanceof ShiftError ||
          err instanceof DayOpsError ||
          err instanceof Error
          ? err.message
          : "Could not close shift."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onCloseDay() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const counted =
        countedCash.trim() === ""
          ? null
          : Math.round(Number(countedCash) * 100)
      if (countedCash.trim() && (!Number.isFinite(counted) || counted! < 0)) {
        throw new DayOpsError("VALIDATION", "Counted cash must be ≥ 0.")
      }
      const { day, preview: p } = await DayOpsService.closeDay({
        storeId,
        actorId: userId,
        actorName: profile?.displayName || profile?.email || null,
        notes: closeNotes || null,
        countedCashPaisa: counted,
        allowOpenShifts,
        syncSheets,
      })
      setMsg(
        `Closed ${day.date}${
          day.sheetsSync?.ran
            ? ` · Sheets sync ${day.sheetsSync.errors.length ? "with errors" : "ok"}`
            : ""
        }`
      )
      setCloseNotes("")
      setCountedCash("")
      setPreview(p)
      await refresh()
    } catch (err) {
      setError(
        err instanceof DayOpsError || err instanceof Error
          ? err.message
          : "Could not close day."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onReopen(dayKey: string) {
    if (!isAdmin(role)) return
    setBusy(true)
    setError(null)
    try {
      const day = await DayOpsService.reopenDay({
        dayKey,
        storeId,
        actorId: userId,
        actorName: profile?.displayName || profile?.email || null,
        reason: reopenReason,
      })
      setMsg(`Re-opened ${day.date}`)
      setReopenReason("")
      await refresh()
    } catch (err) {
      setError(
        err instanceof DayOpsError || err instanceof Error
          ? err.message
          : "Could not re-open day."
      )
    } finally {
      setBusy(false)
    }
  }

  const openShifts =
    preview?.cashierVariance.filter((r) => r.status === "OPEN") ?? []

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Day operations</h1>
        <p className="text-sm text-muted-foreground">
          Open Day → run the store → Close Day. Cashier tills on{" "}
          <Link to="/shifts" className="underline">
            Shifts
          </Link>
          ; cashbook on{" "}
          <Link to="/banking" className="underline">
            Banking
          </Link>
          .
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={dayRef}
          onChange={(e) => setDayRef(e.target.value as DayOpsDayRef)}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
        </select>
        <StatusPill open={openDay} />
        {preview ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void DayOpsExportService.exportClosingPreviewExcel(
                  preview,
                  storeId
                )
              }
            >
              <FileSpreadsheet className="size-4" />
              Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => DayOpsExportService.printClosingPack(preview)}
            >
              <Printer className="size-4" />
              Print
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sunrise className="size-4" />
          <h2 className="font-semibold">Start of day</h2>
        </div>
        {openDay ? (
          <div className="text-sm space-y-1">
            <p>
              Open: <strong>{openDay.date}</strong> · {openDay.label}
            </p>
            <p className="text-muted-foreground">
              Opening cash {money(openDay.openingCashPaisa)} · UPI{" "}
              {money(openDay.openingUpiPaisa)}
              {openDay.openNotes ? ` · ${openDay.openNotes}` : ""}
            </p>
            {openDay.reopenReason ? (
              <p className="text-xs text-amber-800">
                Re-opened: {openDay.reopenReason}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Suggested openings from {suggested.sourceLabel}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
              <div className="space-y-1">
                <Label>Opening cash (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={openingCashRupees}
                  onChange={(e) => setOpeningCashRupees(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Opening UPI (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={openingUpiRupees}
                  onChange={(e) => setOpeningUpiRupees(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>SOD checklist</Label>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                {(
                  [
                    ["bankingVerified", "Banking verified"],
                    ["floatReady", "Float ready"],
                    ["printersOk", "Printers OK"],
                    ["upiQrOk", "UPI QR ready"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checklist[key]}
                      onChange={(e) =>
                        setChecklist((c) => ({ ...c, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1 max-w-md">
              <Label>Notes (optional)</Label>
              <Input
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="e.g. Float verified"
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void onOpenDay()}
            >
              Open day
            </Button>
          </>
        )}
      </section>

      {preview ? <ClosingPanels preview={preview} /> : null}

      {openShifts.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50/40 p-4 space-y-3">
          <h2 className="font-semibold">Close open shifts</h2>
          <p className="text-xs text-muted-foreground">
            Required before Close Day (unless you explicitly allow open
            shifts).
          </p>
          {openShifts.map((s) => (
            <div
              key={s.shiftId}
              className="flex flex-wrap items-end gap-2 rounded-md border bg-background p-3"
            >
              <div className="text-sm flex-1 min-w-[10rem]">
                <p className="font-medium">
                  {s.shiftNumber} · {s.cashierName}
                </p>
                <p className="text-muted-foreground">
                  Expected {money(s.expectedCashPaisa)}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Actual cash (₹)</Label>
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  value={shiftActuals[s.shiftId] ?? ""}
                  onChange={(e) =>
                    setShiftActuals((m) => ({
                      ...m,
                      [s.shiftId]: e.target.value,
                    }))
                  }
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void onCloseShift(s.shiftId, s.cashierId)}
              >
                Close shift
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="size-4" />
          <h2 className="font-semibold">End of day</h2>
        </div>
        {!openDay ? (
          <p className="text-sm text-muted-foreground">
            Open a business day before closing. You can still review today /
            yesterday panels above.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
              <div className="space-y-1">
                <Label>Counted cash (₹, optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Close notes</Label>
                <Input
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={syncSheets}
                onChange={(e) => setSyncSheets(e.target.checked)}
              />
              Sync day to Google Sheets on close
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowOpenShifts}
                onChange={(e) => setAllowOpenShifts(e.target.checked)}
              />
              Allow close with open cashier shifts
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void onCloseDay()}
            >
              <CalendarCheck className="size-4" />
              Close day
            </Button>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recent days
        </h2>
        {isAdmin(role) ? (
          <div className="flex flex-wrap items-end gap-2 max-w-xl">
            <div className="flex-1 space-y-1">
              <Label>Re-open reason (admin)</Label>
              <Input
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Why re-open a closed day?"
              />
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Opened</th>
                <th className="px-3 py-2 text-left font-medium">Closed</th>
                <th className="px-3 py-2 text-left font-medium" />
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{d.date}</td>
                  <td className="px-3 py-1.5">{d.status}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(d.openedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {d.closedAt
                      ? new Date(d.closedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {isAdmin(role) && d.status === "CLOSED" && !openDay ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || reopenReason.trim().length < 3}
                        onClick={() => void onReopen(d.dayKey)}
                      >
                        Re-open
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No business days yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatusPill({ open }: { open: BusinessDayRecord | null }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        open
          ? "bg-emerald-100 text-emerald-900"
          : "bg-muted text-muted-foreground"
      )}
    >
      {open ? `Day open · ${open.date}` : "No open day"}
    </span>
  )
}

function ClosingPanels({ preview }: { preview: DayClosingPreview }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">Day review · {preview.label}</h2>
        <p className="text-xs text-muted-foreground">
          Sales, tenders, refunds, discounts, expenses, stock exceptions,
          cashier variance.
        </p>
      </div>
      {preview.warnings.map((w) => (
        <p
          key={w}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {w}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="Sales summary">
          <Row label="Invoices" value={String(preview.sales.invoiceCount)} />
          <Row
            label="Paid invoices"
            value={String(preview.sales.paidInvoiceCount)}
          />
          <Row label="Sales total" value={money(preview.sales.salesTotalPaisa)} />
          <Row label="Paid sales" value={money(preview.sales.paidSalesPaisa)} />
        </Panel>
        <Panel title="Cash summary">
          <Row label="Cash in" value={money(preview.cash.inPaisa)} />
          <Row label="Cash refunds" value={money(preview.cash.refundsPaisa)} />
          <Row label="Net cash" value={money(preview.cash.netPaisa)} />
          <Row
            label="Banking cash now"
            value={money(preview.bankingClosingCashPaisa)}
          />
        </Panel>
        <Panel title="UPI summary">
          <Row label="UPI in" value={money(preview.upi.inPaisa)} />
          <Row label="UPI refunds" value={money(preview.upi.refundsPaisa)} />
          <Row label="Net UPI" value={money(preview.upi.netPaisa)} />
          <Row
            label="Banking UPI now"
            value={money(preview.bankingClosingUpiPaisa)}
          />
        </Panel>
        <Panel title="Refunds">
          <Row label="Count" value={String(preview.refunds.count)} />
          <Row label="Total" value={money(preview.refunds.totalPaisa)} />
          {preview.refunds.byMethod.map((m) => (
            <Row
              key={m.method}
              label={m.method}
              value={`${m.count} · ${money(m.totalPaisa)}`}
            />
          ))}
        </Panel>
        <Panel title="Discounts">
          <Row
            label="Invoices with discount"
            value={String(preview.discounts.invoiceCountWithDiscount)}
          />
          <Row
            label="Total discounts"
            value={money(preview.discounts.totalDiscountPaisa)}
          />
        </Panel>
        <Panel title="Expenses">
          <Row label="Count" value={String(preview.expenses.count)} />
          <Row label="Total" value={money(preview.expenses.totalPaisa)} />
          {preview.expenses.byMethod.map((m) => (
            <Row key={m.method} label={m.method} value={money(m.totalPaisa)} />
          ))}
        </Panel>
      </div>

      <Panel title="Stock exceptions">
        {preview.stockExceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None for this day.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {preview.stockExceptions.map((s) => (
              <li key={s.id}>
                {s.label} · {s.kind} · {s.varianceLines} line(s)
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Cashier variance">
        {preview.cashierVariance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shifts for this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-medium">Shift</th>
                  <th className="py-1 text-left font-medium">Cashier</th>
                  <th className="py-1 text-left font-medium">Status</th>
                  <th className="py-1 text-right font-medium">Expected</th>
                  <th className="py-1 text-right font-medium">Actual</th>
                  <th className="py-1 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {preview.cashierVariance.map((r) => (
                  <tr key={r.shiftId} className="border-t">
                    <td className="py-1">{r.shiftNumber}</td>
                    <td className="py-1">{r.cashierName}</td>
                    <td className="py-1">{r.status}</td>
                    <td className="py-1 text-right tabular-nums">
                      {money(r.expectedCashPaisa)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {r.actualCashPaisa == null
                        ? "—"
                        : money(r.actualCashPaisa)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {r.variancePaisa == null ? "—" : money(r.variancePaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Separator className="my-2" />
        <p className="text-xs text-muted-foreground">
          Open shifts: {preview.openShiftsCount}.
        </p>
      </Panel>
    </section>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  )
}
