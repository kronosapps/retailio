import { AlertSettingsCard } from "@/modules/notifications"

export function SettingsNotificationsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Staff in-app alert thresholds and role mutes. Values are stored as
          business settings on this device (Firestore sync for thresholds is
          optional later).
        </p>
      </div>
      <AlertSettingsCard />
    </div>
  )
}
