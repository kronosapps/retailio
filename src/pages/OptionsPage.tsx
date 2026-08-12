import { Navigate } from "react-router-dom"

/**
 * Legacy Admin Options → Settings Center.
 * Sheets sync and alerts moved under Settings → Integrations / Notifications.
 */
export function OptionsPage() {
  return <Navigate to="/settings" replace />
}
