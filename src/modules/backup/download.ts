/** Trigger a browser download for a Blob. */

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  downloadBlob(filename, blob)
}

export function backupFilename(
  kind: string,
  ext: "json" | "xlsx",
  storeId?: string | null
): string {
  const day = new Date().toISOString().slice(0, 10)
  const store = (storeId || "store").replace(/[^\w.-]+/g, "_")
  return `retailos-${kind}-${store}-${day}.${ext}`
}
