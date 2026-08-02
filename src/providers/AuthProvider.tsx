import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react"

import {
  InvalidLocalCredentialsError,
  findLocalUser,
  toUserProfile,
} from "@/data/local-users"
import { parseUserProfile } from "@/lib/user-profile"
import type { UserProfile, UserRole } from "@/types/user"

const SESSION_STORAGE_KEY = "retailos.auth.local"

type AuthContextValue = {
  userId: string | null
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<UserProfile>
  signOut: () => Promise<void>
}

type StoredSession = {
  userId: string
  profile: UserProfile
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (typeof parsed.userId !== "string" || !parsed.userId) return null
    const profile = parseUserProfile(parsed.profile)
    if (!profile) return null
    return { userId: parsed.userId, profile }
  } catch {
    return null
  }
}

function writeSession(session: StoredSession) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [bootstrapped] = useState(readSession)
  const [userId, setUserId] = useState<string | null>(
    () => bootstrapped?.userId ?? null
  )
  const [profile, setProfile] = useState<UserProfile | null>(
    () => bootstrapped?.profile ?? null
  )
  const [loading] = useState(false)

  async function signIn(email: string, password: string) {
    const user = findLocalUser(email, password)
    if (!user) {
      throw new InvalidLocalCredentialsError()
    }

    const nextProfile = toUserProfile(user)
    writeSession({ userId: user.id, profile: nextProfile })
    setUserId(user.id)
    setProfile(nextProfile)
    return nextProfile
  }

  async function signOut() {
    clearSession()
    setUserId(null)
    setProfile(null)
  }

  const isAuthenticated = Boolean(userId && profile)

  return (
    <AuthContext.Provider
      value={{
        userId,
        profile,
        role: profile?.role ?? null,
        loading,
        isAuthenticated,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
