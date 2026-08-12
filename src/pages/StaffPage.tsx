import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { FirebaseError } from "firebase/app"
import { Pencil, Trash2, UserCog } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MobileListCard, ResponsiveList } from "@/components/ResponsiveList"
import { AppFirebaseError, getFirebaseErrorMessage } from "@/core/firebase"
import {
  MIN_PASSCODE_LENGTH,
  StaffService,
  roleLabel,
  type StaffListItem,
} from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"
import type { UserRole } from "@/types/user"
import { cn } from "@/lib/utils"

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{2,32}$/,
      "2–32 chars: lowercase letters, numbers, underscore"
    ),
  passcode: z
    .string()
    .min(MIN_PASSCODE_LENGTH, `At least ${MIN_PASSCODE_LENGTH} characters`),
  displayName: z.string().trim().min(1, "Display name is required"),
  role: z.enum(["cashier", "manager", "admin"]),
})

const editSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{2,32}$/,
      "2–32 chars: lowercase letters, numbers, underscore"
    ),
  passcode: z.string(),
  currentPasscode: z.string(),
  displayName: z.string().trim().min(1, "Display name is required"),
  role: z.enum(["cashier", "manager", "admin"]),
  active: z.enum(["active", "inactive"]),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

function staffErrorMessage(error: unknown): string {
  if (error instanceof AppFirebaseError) {
    if (
      error.code === "auth/wrong-password" ||
      error.code === "auth/invalid-credential" ||
      error.code === "auth/invalid-login-credentials"
    ) {
      return "Current passcode is incorrect."
    }
    return error.message
  }
  if (error instanceof FirebaseError) {
    if (error.code === "auth/email-already-exists") {
      return "That username is already taken."
    }
    if (
      error.code === "auth/wrong-password" ||
      error.code === "auth/invalid-credential" ||
      error.code === "auth/invalid-login-credentials"
    ) {
      return "Current passcode is incorrect."
    }
    if (error.code === "permission-denied") {
      return "Only admins can manage staff. Deploy latest Firestore rules if this persists."
    }
    return getFirebaseErrorMessage(error)
  }
  if (error instanceof Error) return error.message
  return "Could not complete staff request."
}

export function StaffPage() {
  const { profile, userId } = useAuth()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [editing, setEditing] = useState<StaffListItem | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ["staff", "list"],
    queryFn: () => StaffService.list(),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      username: "",
      passcode: "",
      displayName: "",
      role: "cashier",
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      username: "",
      passcode: "",
      currentPasscode: "",
      displayName: "",
      role: "cashier",
      active: "active",
    },
  })

  async function onCreate(values: CreateValues) {
    setFormError(null)
    setFormSuccess(null)
    try {
      const created = await StaffService.create({
        ...values,
        storeId: profile?.storeId ?? null,
      })
      setFormSuccess(
        `Created @${created.username} (${roleLabel(created.role as UserRole)})`
      )
      reset({
        username: "",
        passcode: "",
        displayName: "",
        role: "cashier",
      })
      await queryClient.invalidateQueries({ queryKey: ["staff", "list"] })
    } catch (error) {
      setFormError(staffErrorMessage(error))
    }
  }

  function openEdit(row: StaffListItem) {
    setEditError(null)
    setEditing(row)
    editForm.reset({
      username: row.username,
      passcode: "",
      currentPasscode: "",
      displayName: row.displayName,
      role: row.role,
      active: row.active ? "active" : "inactive",
    })
  }

  async function onEdit(values: EditValues) {
    if (!editing) return
    setEditBusy(true)
    setEditError(null)
    try {
      const passcode = values.passcode.trim()
      if (passcode && passcode.length < MIN_PASSCODE_LENGTH) {
        throw new Error(
          `Passcode must be at least ${MIN_PASSCODE_LENGTH} characters.`
        )
      }
      const usernameChanged = values.username !== editing.username
      if ((usernameChanged || passcode) && !values.currentPasscode.trim()) {
        throw new Error(
          "Enter the current passcode to change username or passcode."
        )
      }
      await StaffService.update({
        id: editing.id,
        username: values.username,
        displayName: values.displayName,
        role: values.role,
        active: values.active === "active",
        passcode: passcode || undefined,
        currentPasscode: values.currentPasscode.trim() || undefined,
      })
      setEditing(null)
      setFormSuccess(`Updated @${values.username}`)
      await queryClient.invalidateQueries({ queryKey: ["staff", "list"] })
    } catch (error) {
      setEditError(staffErrorMessage(error))
    } finally {
      setEditBusy(false)
    }
  }

  async function onDelete(row: StaffListItem) {
    if (row.id === userId) {
      setFormError("You cannot delete your own account.")
      return
    }
    const ok = window.confirm(
      `Deactivate @${row.username}? They will not be able to sign in. You can re-activate later via Edit.`
    )
    if (!ok) return
    setDeleteBusyId(row.id)
    setFormError(null)
    try {
      await StaffService.remove(row.id)
      setFormSuccess(`Deactivated @${row.username}`)
      await queryClient.invalidateQueries({ queryKey: ["staff", "list"] })
    } catch (error) {
      setFormError(staffErrorMessage(error))
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCog className="size-6" />
          Staff management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create, view, edit, and deactivate staff. Cashiers get POS only;
          managers also get inventory and sales; admins get full access.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Add staff</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={handleSubmit(onCreate)}
        >
          <div className="space-y-1.5">
            <Label htmlFor="staff-username">Username</Label>
            <Input
              id="staff-username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.username}
              {...register("username")}
            />
            {errors.username ? (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-passcode">Passcode</Label>
            <Input
              id="staff-passcode"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.passcode}
              {...register("passcode")}
            />
            {errors.passcode ? (
              <p className="text-xs text-destructive">{errors.passcode.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Name</Label>
            <Input
              id="staff-name"
              aria-invalid={!!errors.displayName}
              {...register("displayName")}
            />
            {errors.displayName ? (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <select
              id="staff-role"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              )}
              {...register("role")}
            >
              <option value="cashier">Cashier — POS only</option>
              <option value="manager">Manager — POS + inventory + sales</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create staff"}
            </Button>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            {formSuccess ? (
              <p className="text-sm text-muted-foreground">{formSuccess}</p>
            ) : null}
          </div>
        </form>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Team</h2>
        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading staff…</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-destructive">
            {staffErrorMessage(listQuery.error)}
          </p>
        ) : (
          <StaffTable
            rows={listQuery.data ?? []}
            currentUserId={userId}
            deleteBusyId={deleteBusyId}
            onEdit={openEdit}
            onDelete={(row) => void onDelete(row)}
          />
        )}
      </section>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit staff</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={editForm.handleSubmit(onEdit)}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                autoCapitalize="none"
                spellCheck={false}
                {...editForm.register("username")}
              />
              {editForm.formState.errors.username ? (
                <p className="text-xs text-destructive">
                  {editForm.formState.errors.username.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" {...editForm.register("displayName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-current-passcode">Current passcode</Label>
              <Input
                id="edit-current-passcode"
                type="password"
                autoComplete="current-password"
                placeholder="Needed to change username or passcode"
                {...editForm.register("currentPasscode")}
              />
              <p className="text-xs text-muted-foreground">
                Required only when changing username or passcode (Spark plan —
                no Cloud Functions). Name / role / status can save without it.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-passcode">New passcode</Label>
              <Input
                id="edit-passcode"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep current"
                {...editForm.register("passcode")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                )}
                {...editForm.register("role")}
              >
                <option value="cashier">Cashier — POS only</option>
                <option value="manager">
                  Manager — POS + inventory + sales
                </option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                )}
                {...editForm.register("active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {editError ? (
              <p className="text-sm text-destructive">{editError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StaffTable({
  rows,
  currentUserId,
  deleteBusyId,
  onEdit,
  onDelete,
}: {
  rows: StaffListItem[]
  currentUserId: string | null
  deleteBusyId: string | null
  onEdit: (row: StaffListItem) => void
  onDelete: (row: StaffListItem) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        No staff accounts yet.
      </p>
    )
  }

  return (
    <ResponsiveList
      cards={rows.map((row) => (
        <MobileListCard
          key={row.id}
          title={`@${row.username}`}
          meta={
            <>
              {row.displayName} · {roleLabel(row.role)}
            </>
          }
          badge={
            <span
              className={cn(
                "text-xs",
                row.active ? "text-muted-foreground" : "text-rose-700"
              )}
            >
              {row.active ? "Active" : "Inactive"}
            </span>
          }
          actions={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={row.id === currentUserId}
                onClick={() => onEdit(row)}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={
                  row.id === currentUserId ||
                  !row.active ||
                  deleteBusyId === row.id
                }
                onClick={() => onDelete(row)}
              >
                <Trash2 data-icon="inline-start" />
                {deleteBusyId === row.id ? "…" : "Deactivate"}
              </Button>
            </>
          }
        />
      ))}
      table={
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="px-3 py-2 font-medium">@{row.username}</td>
                  <td className="px-3 py-2">{row.displayName}</td>
                  <td className="px-3 py-2">{roleLabel(row.role)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.active ? "Active" : "Inactive"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={row.id === currentUserId}
                        onClick={() => onEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={
                          row.id === currentUserId ||
                          !row.active ||
                          deleteBusyId === row.id
                        }
                        onClick={() => onDelete(row)}
                      >
                        {deleteBusyId === row.id ? "…" : "Deactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    />
  )
}
