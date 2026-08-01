import { Navigate, Outlet } from "react-router-dom"

import { useAuth } from "@/providers/AuthProvider"

export function RequireGuest() {
  const { isAuthenticated, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={role === "cashier" ? "/pos" : "/"} replace />
  }

  return <Outlet />
}
