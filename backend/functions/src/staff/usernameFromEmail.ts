export function usernameFromEmailFallback(email: string): string {
  const local = email.split("@")[0]?.trim().toLowerCase() ?? ""
  return local || email.trim().toLowerCase() || "unknown"
}
