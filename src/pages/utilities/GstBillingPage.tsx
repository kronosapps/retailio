import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  GST_SLAB_RATES,
  type GstPricingMode,
} from "@/data/gstSettings"
import { formatMoney } from "@/lib/money"
import {
  GstService,
  type GstBillingReport,
  type GstTaxDocument,
} from "@/modules/gst"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

function money(paisa: number) {
  return formatMoney(paisa)
}

/**
 * GST / Tax-Correct Billing — settings, operational reports, tax CN/DN,
 * and filing placeholders (GSTR-1, GSTR-3B, e-invoice, e-way).
 */
export function GstBillingPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState("summary")
  const [report, setReport] = useState<GstBillingReport | null>(null)
  const [docs, setDocs] = useState<GstTaxDocument[]>([])
  const [settings, setSettings] = useState(() => GstService.getSettings())
  const [savedFlash, setSavedFlash] = useState(false)

  function refresh() {
    void GstService.getBillingReport(profile?.storeId ?? null).then(setReport)
    setDocs(GstService.listTaxDocuments())
    setSettings(GstService.getSettings())
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.storeId])

  function saveSettings() {
    GstService.saveSettings(settings)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
    refresh()
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          GST / Tax-Correct Billing
        </h1>
        <p className="text-sm text-muted-foreground">
          Line-level HSN & rates, CGST/SGST/IGST, inclusive/exclusive pricing,
          B2B/B2C. Filing exports stay placeholders until tax data is complete.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="hsn">HSN</TabsTrigger>
          <TabsTrigger value="documents">Credit / Debit</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="filing">Filing (soon)</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          {!report ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
                <p className="font-medium">Not filing-ready</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {report.meta.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  {report.meta.missingFields.map((f) => (
                    <li key={f}>Missing: {f}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                {report.periodLabel} · pricing {report.pricingMode} ·{" "}
                {report.invoiceCount} invoices
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Taxable" value={money(report.taxablePaisa)} />
                <Metric label="CGST" value={money(report.cgstPaisa)} />
                <Metric label="SGST" value={money(report.sgstPaisa)} />
                <Metric label="IGST" value={money(report.igstPaisa)} />
                <Metric label="Total GST" value={money(report.gstPaisa)} />
              </div>
              <SimpleTable
                columns={["Rate %", "Taxable", "CGST", "SGST", "IGST", "GST"]}
                rows={report.byRate.map((r) => [
                  String(r.rate),
                  money(r.taxablePaisa),
                  money(r.cgstPaisa),
                  money(r.sgstPaisa),
                  money(r.igstPaisa),
                  money(r.gstPaisa),
                ])}
              />
              <SimpleTable
                columns={["Party", "Invoices", "Taxable", "GST"]}
                rows={report.byParty.map((r) => [
                  r.bucket,
                  String(r.invoiceCount),
                  money(r.taxablePaisa),
                  money(r.gstPaisa),
                ])}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="hsn" className="mt-4 space-y-3">
          {!report ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : report.byHsn.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No line-level HSN yet. New POS sales freeze HSN from the product
              catalog when set.
            </p>
          ) : (
            <SimpleTable
              columns={[
                "HSN/SAC",
                "Rate %",
                "Lines",
                "Taxable",
                "CGST",
                "SGST",
                "IGST",
              ]}
              rows={report.byHsn.map((r) => [
                r.hsnCode,
                String(r.gstRate),
                String(r.lineCount),
                money(r.taxablePaisa),
                money(r.cgstPaisa),
                money(r.sgstPaisa),
                money(r.igstPaisa),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            GST tax credit/debit notes (distinct from CRM store-credit notes).
            Issue from an invoice id to reverse tax lines.
          </p>
          <IssueTaxNoteForm
            onIssued={() => {
              setDocs(GstService.listTaxDocuments())
              refresh()
            }}
          />
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tax credit/debit notes yet.
            </p>
          ) : (
            <SimpleTable
              columns={["Doc", "Type", "Invoice", "Party", "Total", "Status"]}
              rows={docs.slice(0, 40).map((d) => [
                d.documentNumber,
                d.documentType,
                d.referenceInvoiceId || "—",
                d.partyType,
                money(d.totalPaisa),
                d.status,
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Pricing mode</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={settings.pricingMode}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    pricingMode: e.target.value as GstPricingMode,
                  }))
                }
              >
                <option value="INCLUSIVE">Tax inclusive (retail)</option>
                <option value="EXCLUSIVE">Tax exclusive</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Default GST rate %</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={settings.defaultGstRate}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    defaultGstRate: Number(e.target.value),
                  }))
                }
              >
                {GST_SLAB_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Store GSTIN</Label>
              <Input
                value={settings.storeGstin}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    storeGstin: e.target.value.toUpperCase(),
                    storeStateCode:
                      e.target.value.trim().length >= 2
                        ? e.target.value.trim().slice(0, 2)
                        : s.storeStateCode,
                  }))
                }
                placeholder="36AAAAA0000A1Z5"
              />
            </div>
            <div className="space-y-1">
              <Label>Store state code</Label>
              <Input
                value={settings.storeStateCode}
                maxLength={2}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    storeStateCode: e.target.value.replace(/\D/g, "").slice(0, 2),
                    defaultPlaceOfSupply:
                      s.defaultPlaceOfSupply ||
                      e.target.value.replace(/\D/g, "").slice(0, 2),
                  }))
                }
                placeholder="36"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Legal name</Label>
              <Input
                value={settings.storeLegalName}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    storeLegalName: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Intra-state (same state code) → CGST + SGST. Different customer
            state / GSTIN prefix → IGST. Product catalog HSN and gstRate drive
            line tax on POS.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={saveSettings}>
              Save GST settings
            </Button>
            {savedFlash ? (
              <span className="text-xs text-muted-foreground">Saved</span>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="filing" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Placeholders only — we will not rush e-invoicing until underlying
            tax data is correct.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {GstService.filingPlaceholders().map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-border px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.title}</p>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] uppercase",
                      p.status === "PLANNED"
                        ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.description}
                </p>
                <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                  {p.prerequisites.map((req) => (
                    <li key={req}>{req}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function IssueTaxNoteForm({ onIssued }: { onIssued: () => void }) {
  const [invoiceId, setInvoiceId] = useState("")
  const [type, setType] = useState<"CREDIT_NOTE" | "DEBIT_NOTE">("CREDIT_NOTE")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    try {
      GstService.issueTaxNote({
        documentType: type,
        referenceInvoiceId: invoiceId.trim(),
        reason: reason.trim() || null,
      })
      setInvoiceId("")
      setReason("")
      onIssued()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue note.")
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <Label className="text-xs">Invoice id</Label>
        <Input
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          placeholder="INV-…"
          className="w-44"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <select
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={type}
          onChange={(e) =>
            setType(e.target.value as "CREDIT_NOTE" | "DEBIT_NOTE")
          }
        >
          <option value="CREDIT_NOTE">Tax credit note</option>
          <option value="DEBIT_NOTE">Tax debit note</option>
        </select>
      </div>
      <div className="min-w-[10rem] flex-1 space-y-1">
        <Label className="text-xs">Reason</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Return / price correction"
        />
      </div>
      <Button type="button" size="sm" onClick={submit}>
        Issue
      </Button>
      {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function SimpleTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
