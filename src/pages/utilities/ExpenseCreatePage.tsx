import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExpenseService } from "@/modules/expense/ExpenseService"
import { rupeesToPaisa } from "@/lib/money"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Supplies",
  "Transport",
  "Marketing",
  "Maintenance",
  "Other",
]

/**
 * Utilities → Expenses — create via ExpenseService only (never Firestore from UI).
 */
export function ExpenseCreatePage() {
  const { userId, profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [amountRupees, setAmountRupees] = useState("")
  const [category, setCategory] = useState("Other")
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI">("Cash")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = title.trim()
    if (!name) {
      setError("Title is required.")
      return
    }
    const rupees = Number(amountRupees)
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError("Amount must be a positive number in rupees.")
      return
    }

    setBusy(true)
    try {
      await ExpenseService.save({
        id: "",
        title: name,
        amountPaisa: rupeesToPaisa(rupees),
        category,
        paymentMethod,
        createdBy: userId,
        storeId: profile?.storeId ?? null,
        createdAt: new Date().toISOString(),
      })
      navigate("/utilities/report-expense")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Add Expense</h2>
          <p className="text-sm text-muted-foreground">
            Creates an expense via ExpenseService. Posts to the journal when
            AccountingEngine receives EXPENSE_CREATED.
          </p>
        </div>
        <Link
          to="/utilities/report-expense"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View expenses
        </Link>
      </div>

      <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <div className="space-y-1">
          <Label htmlFor="exp-title">Title</Label>
          <Input
            id="exp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Shop rent April"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-amount">Amount (₹)</Label>
          <Input
            id="exp-amount"
            inputMode="decimal"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-cat">Category</Label>
          <select
            id="exp-cat"
            className={cn(
              "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
            )}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-method">Payment method</Label>
          <select
            id="exp-method"
            className={cn(
              "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
            )}
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "Cash" | "UPI")
            }
          >
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
          </select>
        </div>

        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </div>
  )
}
