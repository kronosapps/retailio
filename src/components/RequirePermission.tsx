import { Navigate, Outlet, useLocation } from "react-router-dom"

import { canAccessPath, homePathForRole } from "@/modules/staff"
import { useAuth } from "@/providers/AuthProvider"

/**
 * Route guard — allows access when the signed-in role may visit this path.
 */
export function RequirePermission() {
  const { role, loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !role) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!canAccessPath(role, location.pathname)) {
    return <Navigate to={homePathForRole(role)} replace />
  }

  return <Outlet />
}
