import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FinancialYearService } from "@/modules/financialYear"

export function FinancialYearPage() {
  const [tick, setTick] = useState(0)
  const years = useMemo(() => {
    void tick
    return FinancialYearService.list()
  }, [tick])
  const active = FinancialYearService.getActive()
  const [label, setLabel] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [error, setError] = useState<string | null>(null)

  function create() {
    setError(null)
    try {
      FinancialYearService.create({
        label,
        startDate: start,
        endDate: end,
        makeActive: false,
      })
      setLabel("")
      setStart("")
      setEnd("")
      setTick((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create FY.")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Financial Year</h2>
        <p className="text-sm text-muted-foreground">
          Active: <strong>{active.label}</strong> — used by accounting &
          statutory Utilities views.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {years.map((fy) => (
              <tr key={fy.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{fy.label}</td>
                <td className="px-3 py-2">{fy.startDate}</td>
                <td className="px-3 py-2">{fy.endDate}</td>
                <td className="px-3 py-2">{fy.status}</td>
                <td className="px-3 py-2">
                  {fy.status !== "active" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        FinancialYearService.setActive(fy.id)
                        setTick((n) => n + 1)
                      }}
                    >
                      Make active
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="grid max-w-xl gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <div className="sm:col-span-2 space-y-1">
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="FY 2027–28"
          />
        </div>
        <div className="space-y-1">
          <Label>Start</Label>
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>End</Label>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="sm:col-span-2 w-fit">
          Create financial year
        </Button>
      </form>
    </div>
  )
}
