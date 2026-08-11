import { useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Download, FileSpreadsheet, Upload } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  ProductImportParseError,
  ProductImportService,
  type ProductImportPreview,
  type ProductImportProgress,
  type ProductImportResult,
} from "@/modules/productImport"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"
import { formatMoney, rupeesToPaisa } from "@/lib/money"

const PREVIEW_PAGE_SIZE = 25

/**
 * Inventory → Import — Excel bulk product import.
 * Upload/validate never writes; only confirmed Push uses ProductService.
 */
export function BulkProductImportPage() {
  const { userId, profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ProductImportPreview | null>(null)
  const [page, setPage] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [progress, setProgress] = useState<ProductImportProgress | null>(null)
  const [result, setResult] = useState<ProductImportResult | null>(null)

  const pageRows = useMemo(() => {
    if (!preview) return []
    const start = page * PREVIEW_PAGE_SIZE
    return preview.rows.slice(start, start + PREVIEW_PAGE_SIZE)
  }, [preview, page])

  const pageCount = preview
    ? Math.max(1, Math.ceil(preview.rows.length / PREVIEW_PAGE_SIZE))
    : 1

  const canPush = Boolean(preview && preview.newRows > 0 && !progress?.running)

  async function onChooseFile(file: File | null) {
    setError(null)
    setPreview(null)
    setResult(null)
    setProgress(null)
    setPage(0)
    if (!file) {
      setFileName(null)
      return
    }
    setFileName(file.name)
  }

  async function onValidate() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError("Choose an Excel (.xlsx) file first.")
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const next = await ProductImportService.parseAndValidate(file)
      setPreview(next)
      setPage(0)
    } catch (err) {
      setPreview(null)
      setError(
        err instanceof ProductImportParseError || err instanceof Error
          ? err.message
          : "Could not parse the Excel file."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmPush() {
    if (!preview) return
    setConfirmOpen(false)
    setBusy(true)
    setError(null)
    try {
      const importResult = await ProductImportService.pushToFirestore(preview, {
        storeId: profile?.storeId ?? null,
        actorId: userId,
        onProgress: setProgress,
      })
      setResult(importResult)
      // Refresh preview statuses is not required; show result panel.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Import failed unexpectedly."
      )
    } finally {
      setBusy(false)
    }
  }

  function resetAll() {
    setFileName(null)
    setPreview(null)
    setResult(null)
    setProgress(null)
    setError(null)
    setPage(0)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Bulk Product Import
        </h2>
        <p className="text-sm text-muted-foreground">
          Import products into RetailOS from Excel. Uploading and validating
          never writes data — only Push to Firestore creates products via
          ProductService.
        </p>
      </div>

      {result ? (
        <ResultPanel
          result={result}
          preview={preview}
          onImportAnother={resetAll}
        />
      ) : (
        <>
          <section className="space-y-3">
            <StepHeading n={1} title="Download Template" />
            <p className="text-sm text-muted-foreground">
              Official template with Instructions, Data Dictionary, and sample
              rows from your catalog.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void ProductImportService.downloadTemplate()}
              >
                <Download className="size-4" />
                Download Excel Template
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void ProductImportService.downloadExport()}
              >
                <FileSpreadsheet className="size-4" />
                Export Products
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <StepHeading n={2} title="Fill Excel Sheet" />
            <p className="text-sm text-muted-foreground">
              Use the provided column structure. Do not rename required columns.
              Prices are in rupees. Import mode is Add New only.
            </p>
          </section>

          <Separator />

          <section className="space-y-3">
            <StepHeading n={3} title="Upload Excel" />
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onChooseFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                Choose Excel File
              </Button>
              <span className="text-sm text-muted-foreground">
                {fileName ?? "Supported: .xlsx"}
              </span>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <StepHeading n={4} title="Validate" />
            <Button
              type="button"
              disabled={busy || !fileName}
              onClick={() => void onValidate()}
            >
              Validate File
            </Button>
          </section>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {preview ? (
            <>
              <Separator />
              <PreviewPanel
                preview={preview}
                pageRows={pageRows}
                page={page}
                pageCount={pageCount}
                onPage={setPage}
                busy={busy}
                canPush={canPush}
                progress={progress}
                onDownloadErrors={() =>
                  void ProductImportService.downloadErrorReport(preview)
                }
                onPush={() => setConfirmOpen(true)}
              />
            </>
          ) : null}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push Products to Firestore?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              You are about to add{" "}
              <span className="font-medium text-foreground">
                {preview?.newRows ?? 0} new products
              </span>
              .
            </p>
            <p>
              {preview?.duplicateRows ?? 0} duplicate rows will be skipped.{" "}
              {preview?.invalidRows ?? 0} invalid rows will not be imported.
            </p>
            <p>
              This action creates product records through ProductService →
              ProductRepository (Firestore or local fallback). No stock
              movements are created.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void onConfirmPush()}>
              Push to Firestore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="text-sm font-semibold tracking-tight">
      Step {n}
      <span className="ml-2 font-medium text-muted-foreground">{title}</span>
    </h3>
  )
}

function PreviewPanel({
  preview,
  pageRows,
  page,
  pageCount,
  onPage,
  busy,
  canPush,
  progress,
  onDownloadErrors,
  onPush,
}: {
  preview: ProductImportPreview
  pageRows: ProductImportPreview["rows"]
  page: number
  pageCount: number
  onPage: (p: number) => void
  busy: boolean
  canPush: boolean
  progress: ProductImportProgress | null
  onDownloadErrors: () => void
  onPush: () => void
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Import Preview</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <Stat label="Total Rows" value={preview.totalRows} />
        <Stat label="Valid / New" value={preview.newRows} />
        <Stat label="Invalid" value={preview.invalidRows} />
        <Stat label="Duplicates" value={preview.duplicateRows} />
        <Stat
          label="Template"
          value={preview.templateVersion ?? "—"}
          text
        />
      </div>

      {progress?.running ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Importing Products</p>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.imported} imported · {progress.failed} failed ·{" "}
            {progress.remaining} remaining ({progress.percent}%)
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">GST</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.rowNumber} className="border-b last:border-0">
                <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.sku || "—"}</td>
                <td className="px-3 py-2">{row.name || "—"}</td>
                <td className="px-3 py-2">{row.category || "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.sellingPrice == null || Number.isNaN(row.sellingPrice)
                    ? "—"
                    : formatMoney(rupeesToPaisa(row.sellingPrice))}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {row.gstRate == null || Number.isNaN(row.gstRate)
                    ? "—"
                    : `${row.gstRate}%`}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">
                  {row.messages.join(" ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.rows.length > PREVIEW_PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={
            busy ||
            (preview.invalidRows === 0 && preview.duplicateRows === 0)
          }
          onClick={onDownloadErrors}
        >
          Download Errors
        </Button>
        <Button
          type="button"
          disabled={!canPush || busy}
          onClick={onPush}
        >
          Push {preview.newRows} Products to Firestore
        </Button>
      </div>
    </section>
  )
}

function ResultPanel({
  result,
  preview,
  onImportAnother,
}: {
  result: ProductImportResult
  preview: ProductImportPreview | null
  onImportAnother: () => void
}) {
  return (
    <section className="space-y-4 rounded-md border p-4">
      <h3 className="text-lg font-semibold">Import Complete</h3>
      <p className="text-sm text-muted-foreground">
        {result.imported} products successfully added. {result.skipped} rows
        skipped. {result.failed} rows failed.
      </p>
      {result.failures.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-auto text-xs text-red-800">
          {result.failures.map((f) => (
            <li key={`${f.rowNumber}-${f.sku}`}>
              Row {f.rowNumber} ({f.sku}): {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/inventory/items"
          className={buttonVariants({ variant: "default" })}
        >
          View Products
        </Link>
        {preview ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void ProductImportService.downloadErrorReport(preview)
            }
          >
            Download Error Report
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onImportAnother}>
          Import Another File
        </Button>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  text,
}: {
  label: string
  value: number | string
  text?: boolean
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-semibold",
          text ? "text-sm" : "text-lg tabular-nums"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: ProductImportPreview["rows"][number]["status"]
}) {
  const styles =
    status === "NEW"
      ? "bg-emerald-100 text-emerald-900"
      : status === "DUPLICATE"
        ? "bg-amber-100 text-amber-900"
        : status === "INVALID"
          ? "bg-red-100 text-red-800"
          : "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        styles
      )}
    >
      {status}
    </span>
  )
}
