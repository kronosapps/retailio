import { Navigate, Outlet } from "react-router-dom"

import { useAuth } from "@/providers/AuthProvider"

export function RequireAdmin() {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (role !== "admin") {
    return <Navigate to="/pos" replace />
  }

  return <Outlet />
}
