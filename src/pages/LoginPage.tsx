import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FirebaseError } from "firebase/app"
import { useNavigate, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/providers/AuthProvider"
import type { UserRole } from "@/types/user"
import { cn } from "@/lib/utils"

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginValues = z.infer<typeof loginSchema>

function authErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Invalid email or password."
      case "auth/too-many-requests":
        return "Too many attempts. Try again later."
      case "auth/invalid-api-key":
        return "Firebase API key is invalid. Check your .env values."
      default:
        return "Unable to sign in. Please try again."
    }
  }
  if (error instanceof Error && error.message.includes("not configured")) {
    return error.message
  }
  return "Unable to sign in. Please try again."
}

export function LoginPage() {
  const { signIn, signInOverride, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [overrideEnabled, setOverrideEnabled] = useState(!configured)
  const [overrideRole, setOverrideRole] = useState<UserRole>("admin")

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  function goAfterLogin(role: UserRole | undefined) {
    const from = (location.state as { from?: { pathname?: string } } | null)
      ?.from?.pathname
    const fallback = role === "cashier" ? "/pos" : "/"
    navigate(from && from !== "/login" ? from : fallback, { replace: true })
  }

  function onOverrideContinue() {
    setFormError(null)
    const profile = signInOverride(overrideRole)
    goAfterLogin(profile.role)
  }

  async function onSubmit(values: LoginValues) {
    setFormError(null)
    try {
      const profile = await signIn(values.email, values.password)
      goAfterLogin(profile?.role)
    } catch (error) {
      setFormError(authErrorMessage(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">RetailOS</CardTitle>
          <CardDescription>Sign in to your store account</CardDescription>
        </CardHeader>
        <CardContent>
          {!configured && !overrideEnabled ? (
            <div className="mb-4 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">Firebase is not configured</p>
              <p className="text-destructive/90">
                Copy <code className="text-xs">.env.example</code> to{" "}
                <code className="text-xs">.env</code>, or turn on Override
                login below.
              </p>
            </div>
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="override-login">Override login</Label>
              <p className="text-xs text-muted-foreground">
                Skip Firebase and enter with a local role
              </p>
            </div>
            <Switch
              id="override-login"
              checked={overrideEnabled}
              onCheckedChange={setOverrideEnabled}
            />
          </div>

          {overrideEnabled ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["admin", "cashier"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setOverrideRole(role)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                        overrideRole === role
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={onOverrideContinue}
              >
                Continue as {overrideRole}
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  disabled={!configured}
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  disabled={!configured}
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>

              {formError ? (
                <p className="text-sm text-destructive">{formError}</p>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !configured}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
