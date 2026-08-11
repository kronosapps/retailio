import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  InvalidLocalCredentialsError,
  findLocalUser,
  toUserProfile,
} from "@/data/local-users"
import { MissingStoreProfileError } from "@/lib/user-profile"
import {
  AppFirebaseError,
  fetchUserProfile,
  getFirebaseErrorMessage,
  isFirebaseConfigured,
  login as firebaseLogin,
  logout as firebaseLogout,
  subscribeToAuthChanges,
} from "@/core/firebase"
import {
  normalizePasscode,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/modules/staff"
import type { UserProfile, UserRole } from "@/types/user"

const LOCAL_SESSION_KEY = "retailos.auth.local"

type AuthContextValue = {
  userId: string | null
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  isAuthenticated: boolean
  /** True when Firebase Auth is the active provider. */
  usingFirebaseAuth: boolean
  signIn: (username: string, passcode: string) => Promise<UserProfile>
  signOut: () => Promise<void>
}

type StoredLocalSession = {
  userId: string
  profile: UserProfile
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readLocalSession(): StoredLocalSession | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredLocalSession>
    if (typeof parsed.userId !== "string" || !parsed.userId) return null
    if (!parsed.profile) return null
    return parsed as StoredLocalSession
  } catch {
    return null
  }
}

function writeLocalSession(session: StoredLocalSession) {
  sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
}

function clearLocalSession() {
  sessionStorage.removeItem(LOCAL_SESSION_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const usingFirebaseAuth = isFirebaseConfigured
  const localBootstrap = !usingFirebaseAuth ? readLocalSession() : null

  const [userId, setUserId] = useState<string | null>(
    () => localBootstrap?.userId ?? null
  )
  const [profile, setProfile] = useState<UserProfile | null>(
    () => localBootstrap?.profile ?? null
  )
  const [loading, setLoading] = useState(usingFirebaseAuth)

  useEffect(() => {
    if (!usingFirebaseAuth) {
      return
    }

    let active = true

    const unsubscribe = subscribeToAuthChanges((user) => {
      void (async () => {
        if (!active) return

        if (!user) {
          setUserId(null)
          setProfile(null)
          setLoading(false)
          return
        }

        try {
          const nextProfile = await fetchUserProfile(user.uid)
          if (!active) return
          setUserId(user.uid)
          setProfile(nextProfile)
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error("[RetailOS] Failed to load user profile", error)
          }
          await firebaseLogout()
          if (!active) return
          setUserId(null)
          setProfile(null)
        } finally {
          if (active) setLoading(false)
        }
      })()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [usingFirebaseAuth])

  async function signIn(
    username: string,
    passcode: string
  ): Promise<UserProfile> {
    const normalizedUser = normalizeUsername(username)
    const normalizedPass = normalizePasscode(passcode)

    if (usingFirebaseAuth) {
      const user = await firebaseLogin({
        email: usernameToAuthEmail(normalizedUser),
        password: normalizedPass,
      })
      try {
        const nextProfile = await fetchUserProfile(user.uid)
        setUserId(user.uid)
        setProfile(nextProfile)
        return nextProfile
      } catch (error) {
        await firebaseLogout()
        setUserId(null)
        setProfile(null)
        if (error instanceof MissingStoreProfileError) throw error
        throw new AppFirebaseError(
          "auth/profile",
          getFirebaseErrorMessage(error),
          error
        )
      }
    }

    const localUser = findLocalUser(normalizedUser, normalizedPass)
    if (!localUser) {
      throw new InvalidLocalCredentialsError()
    }

    const nextProfile = toUserProfile(localUser)
    writeLocalSession({ userId: localUser.id, profile: nextProfile })
    setUserId(localUser.id)
    setProfile(nextProfile)
    return nextProfile
  }

  async function signOut() {
    if (usingFirebaseAuth) {
      await firebaseLogout()
    }
    clearLocalSession()
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
        usingFirebaseAuth,
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
