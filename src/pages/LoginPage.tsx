import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"

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
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher"
import { InvalidLocalCredentialsError } from "@/data/local-users"
import { MissingStoreProfileError } from "@/lib/user-profile"
import { AppFirebaseError, getFirebaseErrorMessage } from "@/core/firebase"
import { homePathForRole } from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"
import type { UserRole } from "@/types/user"

type LoginValues = {
  username: string
  passcode: string
}

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
  const { t } = useTranslation()
  const { signIn, usingFirebaseAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const loginSchema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .trim()
          .min(2, t("login.usernameRequired"))
          .max(32, t("login.usernameTooLong")),
        passcode: z.string().min(1, t("login.passcodeRequired")),
      }),
    [t]
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", passcode: "" },
  })

  function goAfterLogin(role: UserRole | undefined) {
    const from = (location.state as { from?: { pathname?: string } } | null)
      ?.from?.pathname
    const fallback = homePathForRole(role ?? null)
    navigate(from && from !== "/login" ? from : fallback, { replace: true })
  }

  async function onSubmit(values: LoginValues) {
    setFormError(null)
    try {
      const profile = await signIn(values.username, values.passcode)
      goAfterLogin(profile.role)
    } catch (error) {
      setFormError(authErrorMessage(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xl">{t("app.name")}</CardTitle>
            <LanguageSwitcher compact />
          </div>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="username">{t("login.username")}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!errors.username}
                {...register("username")}
              />
              {errors.username ? (
                <p className="text-xs text-destructive">
                  {errors.username.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="passcode">{t("login.passcode")}</Label>
              <Input
                id="passcode"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.passcode}
                {...register("passcode")}
              />
              {errors.passcode ? (
                <p className="text-xs text-destructive">
                  {errors.passcode.message}
                </p>
              ) : null}
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("common.signingIn") : t("common.signIn")}
            </Button>

            {!usingFirebaseAuth ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Demo: <code className="text-[10px]">admin</code> /{" "}
                <code className="text-[10px]">admin123</code>,{" "}
                <code className="text-[10px]">manager</code> /{" "}
                <code className="text-[10px]">mgr123</code>,{" "}
                <code className="text-[10px]">cashier</code> /{" "}
                <code className="text-[10px]">cash123</code>
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
