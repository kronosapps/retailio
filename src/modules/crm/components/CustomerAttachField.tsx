import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { loyaltyConfig } from "@/data/loyalty"
import { CustomerService, type CustomerRecord } from "@/modules/customer"

/**
 * Search + pick a customer for POS cart / loyalty attach.
 */
export function CustomerAttachField({
  storeId,
  onPick,
  placeholder = "Search name or phone",
}: {
  storeId: string | null
  onPick: (c: CustomerRecord) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const hits = useMemo(() => {
    if (query.trim().length < 1) return []
    return CustomerService.search(query, storeId, 6)
  }, [query, storeId])

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
      />
      {hits.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(c)
                  setQuery("")
                }}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.phone || "—"} · {c.loyaltyPunches}/
                  {loyaltyConfig.punchesRequired} punches · {c.loyaltyPoints} pts
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
