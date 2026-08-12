import { useMemo, useState } from "react"
import { Landmark, Lock, LockOpen, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  BankingAuthError,
  BankingService,
  type BankingChannel,
  type BankingEntryDirection,
  type BankingSnapshot,
} from "@/modules/banking"
import { useAuth } from "@/providers/AuthProvider"

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"

export function BankingPage() {
  const { profile, userId } = useAuth()
  const [tick, setTick] = useState(0)
  const [unlocked, setUnlocked] = useState(() => BankingService.isUnlocked())
  const [passcode, setPasscode] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [cashOpening, setCashOpening] = useState("")
  const [upiOpening, setUpiOpening] = useState("")
  const [adjChannel, setAdjChannel] = useState<BankingChannel>("cash")
  const [adjDirection, setAdjDirection] =
    useState<BankingEntryDirection>("in")
  const [adjAmount, setAdjAmount] = useState("")
  const [adjNote, setAdjNote] = useState("")
  const [editPasscode, setEditPasscode] = useState("")

  const account = useMemo(() => BankingService.getAccountInfo(), [])
  const gst = useMemo(() => BankingService.getGstInfo(), [])
  const snapshot: BankingSnapshot = useMemo(() => {
    void tick
    return BankingService.getSnapshot()
  }, [tick])

  function refresh() {
    setTick((n) => n + 1)
  }

  function unlock() {
    setAuthError(null)
    try {
      BankingService.unlock(passcode)
      setUnlocked(true)
      setPasscode("")
      const snap = BankingService.getSnapshot()
      setCashOpening(String(Math.round(snap.opening.cashPaisa / 100)))
      setUpiOpening(String(Math.round(snap.opening.upiPaisa / 100)))
    } catch (error) {
      setAuthError(
        error instanceof BankingAuthError
          ? error.message
          : "Could not unlock banking."
      )
    }
  }

  function lock() {
    BankingService.lock()
    setUnlocked(false)
    setEditPasscode("")
    setFormSuccess(null)
    setFormError(null)
  }

  function onSaveOpening() {
    setFormError(null)
    setFormSuccess(null)
    try {
      BankingService.setOpeningBalances({
        cashRupees: Number(cashOpening),
        upiRupees: Number(upiOpening),
        passcode: editPasscode,
        actorId: userId,
        actorName: profile?.displayName || profile?.username || null,
        storeId: profile?.storeId ?? null,
      })
      setFormSuccess("Opening balances updated.")
      setEditPasscode("")
      refresh()
    } catch (error) {
      setFormError(
        error instanceof BankingAuthError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not save opening balances."
      )
    }
  }

  function onAddAdjustment() {
    setFormError(null)
    setFormSuccess(null)
    try {
      BankingService.addManualAdjustment({
        channel: adjChannel,
        direction: adjDirection,
        amountRupees: Number(adjAmount),
        note: adjNote,
        passcode: editPasscode,
        storeId: profile?.storeId ?? null,
        actorId: userId,
        actorName: profile?.displayName || profile?.username || null,
      })
      setFormSuccess("Ledger entry added.")
      setAdjAmount("")
      setAdjNote("")
      setEditPasscode("")
      refresh()
    } catch (error) {
      setFormError(
        error instanceof BankingAuthError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not add entry."
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Landmark className="size-6" />
            Banking
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opening balances, cash & UPI movement, account and GST details.
            Any change requires the banking admin passcode.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
          {unlocked ? (
            <Button type="button" variant="secondary" size="sm" onClick={lock}>
              <Lock data-icon="inline-start" />
              Lock edits
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <BalanceCard
          label="Cash in hand"
          value={snapshot.balances.cashPaisa}
        />
        <BalanceCard label="UPI balance" value={snapshot.balances.upiPaisa} />
        <BalanceCard label="Combined" value={snapshot.balances.totalPaisa} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Bank account">
          <InfoRow label="Bank" value={account.bankName} />
          <InfoRow label="Account name" value={account.accountName} />
          <InfoRow label="Account no." value={account.accountNumber} mono />
          <InfoRow label="IFSC" value={account.ifsc} mono />
          <InfoRow label="Branch" value={account.branch} />
          <InfoRow label="UPI ID" value={account.upiId} mono />
        </InfoCard>
        <InfoCard title="GST">
          <InfoRow label="GSTIN" value={gst.gstin} mono />
          <InfoRow label="Legal name" value={gst.legalName} />
          <InfoRow label="Trade name" value={gst.tradeName} />
          <InfoRow label="Address" value={gst.address} />
        </InfoCard>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Edit controls</h2>
          {unlocked ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LockOpen className="size-3.5" /> Form unlocked — passcode still
              required per change
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Locked
            </span>
          )}
        </div>

        {!unlocked ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="banking-pass">Admin passcode</Label>
              <Input
                id="banking-pass"
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlock()
                }}
                placeholder="VITE_BANKING_PASSCODE"
                className="w-56"
              />
            </div>
            <Button type="button" onClick={unlock}>
              Unlock to edit
            </Button>
            {authError ? (
              <p className="text-sm text-destructive">{authError}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="open-cash">Opening cash (₹)</Label>
                <Input
                  id="open-cash"
                  type="number"
                  min={0}
                  step={1}
                  value={cashOpening}
                  onChange={(e) => setCashOpening(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="open-upi">Opening UPI (₹)</Label>
                <Input
                  id="open-upi"
                  type="number"
                  min={0}
                  step={1}
                  value={upiOpening}
                  onChange={(e) => setUpiOpening(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-pass-open">Confirm passcode</Label>
                <Input
                  id="edit-pass-open"
                  type="password"
                  value={editPasscode}
                  onChange={(e) => setEditPasscode(e.target.value)}
                  placeholder="Required"
                  className="w-56"
                />
              </div>
              <Button type="button" onClick={onSaveOpening}>
                Save opening balances
              </Button>
            </div>

            <Separator />

            <h3 className="text-sm font-medium">Manual money in / out</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <select
                  className={selectClass}
                  value={adjChannel}
                  onChange={(e) =>
                    setAdjChannel(e.target.value as BankingChannel)
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <select
                  className={selectClass}
                  value={adjDirection}
                  onChange={(e) =>
                    setAdjDirection(e.target.value as BankingEntryDirection)
                  }
                >
                  <option value="in">In</option>
                  <option value="out">Out</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-amt">Amount (₹)</Label>
                <Input
                  id="adj-amt"
                  type="number"
                  min={1}
                  step={1}
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-note">Note</Label>
                <Input
                  id="adj-note"
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="e.g. Bank deposit"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-pass-adj">Confirm passcode</Label>
                <Input
                  id="edit-pass-adj"
                  type="password"
                  value={editPasscode}
                  onChange={(e) => setEditPasscode(e.target.value)}
                  placeholder="Required"
                  className="w-56"
                />
              </div>
              <Button type="button" onClick={onAddAdjustment}>
                Post entry
              </Button>
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            {formSuccess ? (
              <p className="text-sm text-muted-foreground">{formSuccess}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ledger</h2>
        <p className="text-xs text-muted-foreground">
          Opening — cash {formatMoney(snapshot.opening.cashPaisa)}, UPI{" "}
          {formatMoney(snapshot.opening.upiPaisa)}
          {snapshot.opening.updatedAt
            ? ` · set ${new Date(snapshot.opening.updatedAt).toLocaleString("en-IN")}`
            : " · from env defaults"}
        </p>
        <ResponsiveList
          cards={
            snapshot.entries.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                No movements yet.
              </p>
            ) : (
              snapshot.entries.map((entry) => (
                <MobileListCard
                  key={entry.id}
                  title={
                    <span className="tabular-nums">
                      {formatMoney(entry.amountPaisa)}{" "}
                      <span
                        className={
                          entry.direction === "in"
                            ? "text-emerald-700"
                            : "text-destructive"
                        }
                      >
                        {entry.direction.toUpperCase()}
                      </span>
                    </span>
                  }
                  meta={
                    <>
                      {new Date(entry.createdAt).toLocaleString("en-IN")} ·{" "}
                      <span className="capitalize">{entry.channel}</span> ·{" "}
                      <span className="capitalize">{entry.source}</span>
                      {entry.note ? ` · ${entry.note}` : ""}
                    </>
                  }
                />
              ))
            )
          }
          table={
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">Dir</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No movements yet.
                      </td>
                    </tr>
                  ) : (
                    snapshot.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-border/70 last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {new Date(entry.createdAt).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 capitalize">{entry.channel}</td>
                        <td
                          className={cn(
                            "px-3 py-2 font-medium uppercase",
                            entry.direction === "in"
                              ? "text-emerald-700"
                              : "text-destructive"
                          )}
                        >
                          {entry.direction}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMoney(entry.amountPaisa)}
                        </td>
                        <td className="px-3 py-2 text-xs capitalize">
                          {entry.source}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {entry.note}
                          {entry.reference ? (
                            <span className="ml-1 font-mono text-[10px]">
                              ({entry.reference})
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      </section>
    </div>
  )
}

function BalanceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {formatMoney(value)}
      </p>
    </div>
  )
}

function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(mono && "font-mono text-xs", "sm:text-right")}>
        {value}
      </dd>
    </div>
  )
}
