import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  InventoryError,
  InventoryService,
} from "@/modules/inventory"
import { useAuth } from "@/providers/AuthProvider"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
})

type Values = z.infer<typeof schema>

export function InventoryCategoriesView() {
  const { userId, profile } = useAuth()
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const categories = useMemo(() => {
    void tick
    return InventoryService.listCategories()
  }, [tick])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  })

  async function onCreate(values: Values) {
    setError(null)
    try {
      await InventoryService.createCategory({
        name: values.name,
        storeId: profile?.storeId ?? null,
        createdBy: userId,
      })
      reset({ name: "" })
      setTick((n) => n + 1)
    } catch (err) {
      setError(
        err instanceof InventoryError || err instanceof Error
          ? err.message
          : "Could not create category."
      )
    }
  }

  async function saveEdit(id: string, name: string) {
    setError(null)
    try {
      await InventoryService.updateCategory(id, { name }, userId)
      setEditId(null)
      setTick((n) => n + 1)
    } catch (err) {
      setError(
        err instanceof InventoryError || err instanceof Error
          ? err.message
          : "Could not update category."
      )
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await InventoryService.setCategoryActive(id, active, userId)
    setTick((n) => n + 1)
  }

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-md flex-wrap items-end gap-2"
        onSubmit={handleSubmit(onCreate)}
      >
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="cat-name">New category</Label>
          <Input id="cat-name" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          Create
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  {editId === cat.id ? (
                    <Input
                      defaultValue={cat.name}
                      id={`edit-${cat.id}`}
                      className="max-w-xs"
                    />
                  ) : (
                    cat.name
                  )}
                </td>
                <td className="px-3 py-2">
                  {cat.active ? "Active" : "Inactive"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(cat.updatedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {editId === cat.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const el = document.getElementById(
                              `edit-${cat.id}`
                            ) as HTMLInputElement | null
                            void saveEdit(cat.id, el?.value || cat.name)
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditId(cat.id)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggleActive(cat.id, !cat.active)}
                    >
                      {cat.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No categories yet. Create one or open Inventory to seed from
                  products.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
