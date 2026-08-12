/**
 * Tax credit / debit notes (GST documents) — offline-first.
 * Separate from CRM store-credit notes in creditNotes.ts.
 */

import type { GstTaxDocument } from "@/modules/gst/types"

const STORAGE_KEY = "retailos.gst_tax_documents.v1"

type Store = { version: 1; items: GstTaxDocument[] }

function empty(): Store {
  return { version: 1, items: [] }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Store>
    if (!Array.isArray(parsed.items)) return empty()
    return { version: 1, items: parsed.items }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listGstTaxDocuments(): GstTaxDocument[] {
  return [...read().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getGstTaxDocument(id: string): GstTaxDocument | null {
  return read().items.find((d) => d.id === id) ?? null
}

export function upsertGstTaxDocument(doc: GstTaxDocument): GstTaxDocument {
  const store = read()
  const idx = store.items.findIndex((d) => d.id === doc.id)
  if (idx >= 0) store.items[idx] = doc
  else store.items.push(doc)
  write(store)
  return doc
}

export function listGstTaxDocumentsByInvoice(
  invoiceId: string
): GstTaxDocument[] {
  return listGstTaxDocuments().filter(
    (d) => d.referenceInvoiceId === invoiceId
  )
}

export const GST_TAX_DOCUMENTS_STORAGE_KEY = STORAGE_KEY
