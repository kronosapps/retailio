import { useMemo, useState } from "react"
import { Banknote, Lock, Unlock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney, paisaToRupees } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  ShiftError,
  ShiftService,
  type CashierShiftRecord,
} from "@/modules/shift"
import { useAuth } from "@/providers/AuthProvider"

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

/**
 * Cashier shift / till — open float, cash in/out/drop, close with variance.
 * Separate from Banking (store cashbook).
 */
export function ShiftsPage() {
  const { userId, profile, role } = useAuth()
  const cashierId = userId || ""
  const cashierName =
    profile?.displayName || profile?.username || profile?.email || null
  const canViewAll = role === "admin" || role === "manager"

  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [floatRupees, setFloatRupees] = useState("5000")
  const [openNotes, setOpenNotes] = useState("")
  const [actionAmount, setActionAmount] = useState("")
  const [actionNote, setActionNote] = useState("")
  const [actualCash, setActualCash] = useState("")
  const [closeNotes, setCloseNotes] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const shifts = useMemo(() => {
    void tick
    const all = ShiftService.list()
    if (canViewAll) return all
    return all.filter((s) => s.cashierId === cashierId)
  }, [tick, canViewAll, cashierId])

  const myOpen = useMemo(() => {
    void tick
    return cashierId ? ShiftService.getOpenForCashier(cashierId) : null
  }, [tick, cashierId])

  const active = useMemo(() => {
    void tick
    if (selectedId) {
      return ShiftService.getById(selectedId)
    }
    return myOpen
  }, [tick, selectedId, myOpen])

  function refresh() {
    setTick((n) => n + 1)
  }

  async function onOpen() {
    if (!cashierId) return
    setError(null)
    setBusy(true)
    try {
      const shift = await ShiftService.open({
        cashierId,
        cashierName,
        openingFloatRupees: Number(floatRupees),
        storeId: profile?.storeId ?? null,
        notes: openNotes || null,
        actorId: cashierId,
      })
      setSelectedId(shift.id)
      setOpenNotes("")
      refresh()
    } catch (err) {
      setError(
        err instanceof ShiftError || err instanceof Error
          ? err.message
          : "Could not open shift."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onCashAction(kind: "in" | "out" | "drop") {
    if (!cashierId || !myOpen) return
    setError(null)
    setBusy(true)
    try {
      const params = {
        shiftId: myOpen.id,
        cashierId,
        amountRupees: Number(actionAmount),
        note: actionNote || null,
        actorId: cashierId,
      }
      if (kind === "in") await ShiftService.cashIn(params)
      else if (kind === "out") await ShiftService.cashOut(params)
      else await ShiftService.cashDrop(params)
      setActionAmount("")
      setActionNote("")
      refresh()
    } catch (err) {
      setError(
        err instanceof ShiftError || err instanceof Error
          ? err.message
          : "Could not record cash movement."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onClose() {
    if (!cashierId || !myOpen) return
    setError(null)
    setBusy(true)
    try {
      await ShiftService.close({
        shiftId: myOpen.id,
        cashierId,
        actualCashRupees: Number(actualCash),
        closeNotes: closeNotes || null,
        actorId: cashierId,
      })
      setActualCash("")
      setCloseNotes("")
      refresh()
    } catch (err) {
      setError(
        err instanceof ShiftError || err instanceof Error
          ? err.message
          : "Could not close shift."
      )
    } finally {
      setBusy(false)
    }
  }

  const breakdown = active ? ShiftService.expectedBreakdown(active) : null

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cashier shifts</h1>
        <p className="text-sm text-muted-foreground">
          Till accountability (float → sales → drops → count). Separate from
          Banking store cashbook.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!myOpen ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Unlock className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Open till</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Starting as {cashierName || cashierId || "—"}. Opening float goes
            into expected cash.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="float">Opening cash (₹)</Label>
              <Input
                id="float"
                inputMode="decimal"
                value={floatRupees}
                onChange={(e) => setFloatRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="open-notes">Notes</Label>
              <Input
                id="open-notes"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" disabled={busy || !cashierId} onClick={onOpen}>
                Open shift
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Banknote className="size-4 text-muted-foreground" />
                <h2 className="font-medium">
                  Open · {myOpen.shiftNumber}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Since {formatWhen(myOpen.openedAt)}
              </p>
            </div>
            <p className="text-sm">
              Expected{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(myOpen.expectedCashPaisa)}
              </span>
            </p>
          </div>

          {breakdown ? <ExpectedTable shift={myOpen} /> : null}

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-1">
              <Label>Cash amount (₹)</Label>
              <Input
                inputMode="decimal"
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Note</Label>
              <Input
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Reason"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onCashAction("in")}
            >
              Cash in
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onCashAction("out")}
            >
              Cash out
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onCashAction("drop")}
            >
              Cash drop
            </Button>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              <h3 className="font-medium">Close till</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="actual">Actual cash counted (₹)</Label>
                <Input
                  id="actual"
                  inputMode="decimal"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder={String(
                    Math.round(paisaToRupees(myOpen.expectedCashPaisa))
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="close-notes">Close notes</Label>
                <Input
                  id="close-notes"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={onClose}
                >
                  Close shift
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {active && active.id !== myOpen?.id ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">
            {active.shiftNumber} · {active.status}
          </h2>
          <ExpectedTable shift={active} />
          {active.status === "CLOSED" ? (
            <p className="text-sm">
              Actual {formatMoney(active.actualCashPaisa || 0)} · Variance{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  (active.variancePaisa || 0) < 0 && "text-destructive",
                  (active.variancePaisa || 0) > 0 && "text-emerald-700"
                )}
              >
                {formatMoney(active.variancePaisa || 0)}
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {canViewAll ? "All shifts" : "My shifts"}
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Shift</th>
                <th className="px-3 py-2">Cashier</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No shifts yet.
                  </td>
                </tr>
              ) : (
                shifts.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-muted/30",
                      selectedId === s.id && "bg-muted/40"
                    )}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.shiftNumber}
                    </td>
                    <td className="px-3 py-2">
                      {s.cashierName || s.cashierId}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatWhen(s.openedAt)}
                    </td>
                    <td className="px-3 py-2">{s.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(s.expectedCashPaisa)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.variancePaisa == null
                        ? "—"
                        : formatMoney(s.variancePaisa)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ExpectedTable({ shift }: { shift: CashierShiftRecord }) {
  const b = ShiftService.expectedBreakdown(shift)
  const rows: Array<{ label: string; paisa: number; sign?: "+" | "-" }> = [
    { label: "Opening cash", paisa: b.openingFloatPaisa, sign: "+" },
    { label: "Cash sales", paisa: b.cashSalesPaisa, sign: "+" },
    { label: "Cash in", paisa: b.cashInPaisa, sign: "+" },
    { label: "Cash refunds", paisa: b.cashRefundsPaisa, sign: "-" },
    { label: "Cash expenses", paisa: b.cashExpensesPaisa, sign: "-" },
    { label: "Cash out", paisa: b.cashOutPaisa, sign: "-" },
    { label: "Cash drops", paisa: b.cashDropsPaisa, sign: "-" },
    { label: "Supplier cash", paisa: b.supplierCashPaisa, sign: "-" },
  ]

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.sign === "-" ? "−" : ""}
                {formatMoney(r.paisa)}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-medium">
            <td className="px-3 py-2">Expected cash</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {formatMoney(b.expectedCashPaisa)}
            </td>
          </tr>
          {b.actualCashPaisa != null ? (
            <>
              <tr>
                <td className="px-3 py-1.5 text-muted-foreground">
                  Actual cash
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatMoney(b.actualCashPaisa)}
                </td>
              </tr>
              <tr className="font-medium">
                <td className="px-3 py-2">Variance</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    (b.variancePaisa || 0) < 0 && "text-destructive",
                    (b.variancePaisa || 0) > 0 && "text-emerald-700"
                  )}
                >
                  {formatMoney(b.variancePaisa || 0)}
                </td>
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
