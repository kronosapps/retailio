import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MasterDataService,
  type BrandRecord,
  type PaymentMethodRecord,
  type TaxRateRecord,
  type UnitRecord,
} from "@/modules/masterData"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

export function MasterDataHubPage() {
  const { profile, userId } = useAuth()
  const [links, setLinks] = useState(() =>
    MasterDataService.getHubLinks(profile?.storeId)
  )
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function refresh() {
    setLinks(MasterDataService.getHubLinks(profile?.storeId))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.storeId])

  async function syncFromCatalog() {
    setBusy(true)
    setSyncMsg(null)
    try {
      const result = await MasterDataService.bootstrapFromCatalog(
        profile?.storeId ?? null,
        userId
      )
      refresh()
      setSyncMsg(
        `Synced — categories ${result.categories}, brands ${result.brands}, units ${result.units}, tax ${result.taxRates}, tenders ${result.paymentMethods}.`
      )
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Master Data</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Centralized business entities. Names are unique by{" "}
            <code className="text-xs">nameKey</code> (trim + case-fold) so
            Chocolate / chocolate / CHOCOLATE stay one record.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void syncFromCatalog()}
        >
          {busy ? "Syncing…" : "Sync from catalog"}
        </Button>
      </div>
      {syncMsg ? (
        <p className="text-xs text-muted-foreground">{syncMsg}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link
            key={l.kind}
            to={l.path}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{l.title}</p>
              {typeof l.count === "number" ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {l.count}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function BrandsMasterPage() {
  const { profile, userId } = useAuth()
  const [rows, setRows] = useState<BrandRecord[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setRows(MasterDataService.listBrands())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError(null)
    try {
      await MasterDataService.createBrand({
        name,
        storeId: profile?.storeId ?? null,
        createdBy: userId,
      })
      setName("")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create brand.")
    }
  }

  return (
    <MasterCrudShell
      title="Brands"
      note="Case-insensitive unique. Products store the display name; master prevents duplicates."
      backTo="/utilities/master-data"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label>New brand</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nestlé"
          />
        </div>
        <Button type="button" onClick={() => void add()} disabled={!name.trim()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <MasterTable
        columns={["Name", "Key", "Status", ""]}
        rows={rows.map((r) => [
          r.name,
          r.nameKey,
          r.active ? "Active" : "Inactive",
          <Button
            key={r.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void MasterDataService.setBrandActive(
                r.id,
                !r.active,
                userId
              ).then(refresh)
            }
          >
            {r.active ? "Deactivate" : "Activate"}
          </Button>,
        ])}
      />
    </MasterCrudShell>
  )
}

export function UnitsMasterPage() {
  const { profile, userId } = useAuth()
  const [rows, setRows] = useState<UnitRecord[]>([])
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setRows(MasterDataService.listUnits())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError(null)
    try {
      await MasterDataService.createUnit({
        code,
        name: label || code,
        storeId: profile?.storeId ?? null,
        createdBy: userId,
      })
      setCode("")
      setLabel("")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create unit.")
    }
  }

  return (
    <MasterCrudShell
      title="Units"
      note="Units of measure (g, kg, pcs). Products keep pack size separately."
      backTo="/utilities/master-data"
    >
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
        <div className="space-y-1">
          <Label>Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="g"
          />
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Gram"
          />
        </div>
        <Button
          type="button"
          className="self-end"
          onClick={() => void add()}
          disabled={!code.trim()}
        >
          Add
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <MasterTable
        columns={["Code", "Name", "Status", ""]}
        rows={rows.map((r) => [
          r.code,
          r.name,
          r.active ? "Active" : "Inactive",
          <Button
            key={r.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void MasterDataService.setUnitActive(
                r.id,
                !r.active,
                userId
              ).then(refresh)
            }
          >
            {r.active ? "Deactivate" : "Activate"}
          </Button>,
        ])}
      />
    </MasterCrudShell>
  )
}

export function TaxRatesMasterPage() {
  const { profile, userId } = useAuth()
  const [rows, setRows] = useState<TaxRateRecord[]>([])
  const [rate, setRate] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setRows(MasterDataService.listTaxRates())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError(null)
    try {
      await MasterDataService.createTaxRate({
        ratePercent: Number(rate),
        label: label || undefined,
        storeId: profile?.storeId ?? null,
        createdBy: userId,
      })
      setRate("")
      setLabel("")
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create rate.")
    }
  }

  return (
    <MasterCrudShell
      title="Tax Rates"
      note="GST slabs for product forms. Seeds 0 / 5 / 12 / 18 / 28."
      backTo="/utilities/master-data"
    >
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
        <div className="space-y-1">
          <Label>Rate %</Label>
          <Input
            type="number"
            min={0}
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <Button
          type="button"
          className="self-end"
          onClick={() => void add()}
          disabled={rate === ""}
        >
          Add
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <MasterTable
        columns={["Rate", "Label", "Status", ""]}
        rows={rows.map((r) => [
          `${r.ratePercent}%`,
          r.label,
          r.active ? "Active" : "Inactive",
          <Button
            key={r.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void MasterDataService.setTaxRateActive(r.id, !r.active).then(
                refresh
              )
            }
          >
            {r.active ? "Deactivate" : "Activate"}
          </Button>,
        ])}
      />
    </MasterCrudShell>
  )
}

export function PaymentMethodsMasterPage() {
  const [rows, setRows] = useState<PaymentMethodRecord[]>([])

  function refresh() {
    setRows(MasterDataService.listPaymentMethods())
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <MasterCrudShell
      title="Payment Methods"
      note="Enable or relabel tenders used at POS. Codes stay fixed for accounting / banking."
      backTo="/utilities/master-data"
    >
      <MasterTable
        columns={["Code", "Label", "Enabled", ""]}
        rows={rows.map((r) => [
          r.code,
          <Input
            key={`${r.id}-label`}
            className="h-8"
            defaultValue={r.label}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (!v || v === r.label) return
              MasterDataService.setPaymentMethodLabel(r.id, v)
              refresh()
            }}
          />,
          r.enabled ? "Yes" : "No",
          <Button
            key={r.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              MasterDataService.setPaymentMethodEnabled(r.id, !r.enabled)
              refresh()
            }}
          >
            {r.enabled ? "Disable" : "Enable"}
          </Button>,
        ])}
      />
    </MasterCrudShell>
  )
}

function MasterCrudShell({
  title,
  note,
  backTo,
  children,
}: {
  title: string
  note: string
  backTo: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <Link
          to={backTo}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Master Data
        </Link>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  )
}

function MasterTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: (string | ReactNode)[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c || "actions"} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-3 py-1.5")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
