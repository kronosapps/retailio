import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { InvalidLocalCredentialsError } from "@/data/local-users"
import { MissingStoreProfileError } from "@/lib/user-profile"
import { AppFirebaseError, getFirebaseErrorMessage } from "@/services/firebase"
import { useAuth } from "@/providers/AuthProvider"
import type { UserRole } from "@/types/user"

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

type LoginValues = z.infer<typeof loginSchema>

function authErrorMessage(error: unknown) {
  if (error instanceof InvalidLocalCredentialsError) {
    return error.message
  }
  if (error instanceof MissingStoreProfileError) {
    return error.message
  }
  if (error instanceof AppFirebaseError) {
    return error.message
  }
  return getFirebaseErrorMessage(error)
}

export function LoginPage() {
  const { signIn, usingFirebaseAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

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

  async function onSubmit(values: LoginValues) {
    setFormError(null)
    try {
      const profile = await signIn(values.email, values.password)
      goAfterLogin(profile.role)
    } catch (error) {
      setFormError(authErrorMessage(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">RetailOS</CardTitle>
          <CardDescription>
            {usingFirebaseAuth
              ? "Sign in with your Firebase staff account"
              : "Sign in to your store account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>

            {usingFirebaseAuth ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Create the user in Firebase Authentication, then add a matching
                Firestore document at{" "}
                <code className="text-[10px]">users/&#123;uid&#125;</code> with{" "}
                <code className="text-[10px]">role</code> and{" "}
                <code className="text-[10px]">storeId</code>.
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
