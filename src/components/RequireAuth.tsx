import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/providers/AuthProvider"

export function RequireAuth() {
  const { isAuthenticated, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !profile) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
