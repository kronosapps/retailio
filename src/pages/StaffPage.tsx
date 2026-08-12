import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { FirebaseError } from "firebase/app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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

type CreateValues = z.infer<typeof createSchema>

function staffErrorMessage(error: unknown): string {
  if (error instanceof AppFirebaseError) {
    return error.message
  }
  if (error instanceof FirebaseError) {
    if (error.code === "auth/email-already-exists") {
      return "That username is already taken."
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
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create salesperson accounts with a username and passcode. Cashiers get
          POS only; managers also get inventory and sales management.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">Add staff member</h2>
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
            <Label htmlFor="staff-name">Display name</Label>
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
          <StaffTable rows={listQuery.data ?? []} />
        )}
      </section>
    </div>
  )
}

function StaffTable({ rows }: { rows: StaffListItem[] }) {
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
            <span className="text-xs text-muted-foreground">
              {row.active ? "Active" : "Inactive"}
            </span>
          }
        />
      ))}
      table={
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    />
  )
}
