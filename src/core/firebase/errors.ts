/**
 * Maps Firebase / Auth / Firestore failures to safe, UI-friendly messages.
 * Never surface raw SDK error strings to end users.
 */
export class AppFirebaseError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = "AppFirebaseError"
    this.code = code
    this.cause = cause
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

export function toAppFirebaseError(error: unknown): AppFirebaseError {
  if (error instanceof AppFirebaseError) return error

  const code =
    isRecord(error) && typeof error.code === "string"
      ? error.code
      : "firebase/unknown"

  switch (code) {
    case "auth/invalid-email":
      return new AppFirebaseError(code, "That email address is not valid.", error)
    case "auth/user-disabled":
      return new AppFirebaseError(code, "This account has been disabled.", error)
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return new AppFirebaseError(code, "Email or password is incorrect.", error)
    case "auth/too-many-requests":
      return new AppFirebaseError(
        code,
        "Too many attempts. Please wait and try again.",
        error
      )
    case "auth/network-request-failed":
      return new AppFirebaseError(
        code,
        "Network error. Check your connection and try again.",
        error
      )
    case "permission-denied":
      return new AppFirebaseError(
        code,
        "You do not have permission to perform this action.",
        error
      )
    case "not-found":
      return new AppFirebaseError(code, "The requested record was not found.", error)
    case "unavailable":
      return new AppFirebaseError(
        code,
        "Firestore is temporarily unavailable. Try again shortly.",
        error
      )
    case "firebase/not-configured":
      return new AppFirebaseError(
        code,
        "Firebase is not configured. Check your environment variables.",
        error
      )
    default:
      return new AppFirebaseError(
        code,
        "Something went wrong with the cloud service. Please try again.",
        error
      )
  }
}

/** Safe message for UI layers. */
export function getFirebaseErrorMessage(error: unknown): string {
  return toAppFirebaseError(error).message
}
