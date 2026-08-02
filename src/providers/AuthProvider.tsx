import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"

import { auth, db, isFirebaseConfigured } from "@/lib/firebase"
import {
  MissingStoreProfileError,
  parseUserProfile,
} from "@/lib/user-profile"
import type { UserProfile, UserRole } from "@/types/user"

const OVERRIDE_STORAGE_KEY = "retailos.auth.override"

type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  configured: boolean
  isOverride: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<UserProfile>
  signInOverride: (role: UserRole) => UserProfile
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function createOverrideProfile(role: UserRole): UserProfile {
  return {
    email: `override-${role}@retailos.local`,
    displayName: role === "admin" ? "Override Admin" : "Override Cashier",
    role,
    storeId: "store-override",
  }
}

function readOverrideProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(OVERRIDE_STORAGE_KEY)
    if (!raw) return null
    return parseUserProfile(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeOverrideProfile(profile: UserProfile) {
  sessionStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(profile))
}

function clearOverrideProfile() {
  sessionStorage.removeItem(OVERRIDE_STORAGE_KEY)
}

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null
  const snap = await getDoc(doc(db, "users", uid))
  if (!snap.exists()) return null
  return parseUserProfile(snap.data())
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [bootstrappedOverride] = useState(readOverrideProfile)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(bootstrappedOverride)
  const [isOverride, setIsOverride] = useState(Boolean(bootstrappedOverride))
  const [loading, setLoading] = useState(
    () => !bootstrappedOverride && isFirebaseConfigured
  )

  useEffect(() => {
    if (bootstrappedOverride) return

    const firebaseAuth = auth
    if (!firebaseAuth) return

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      if (!nextUser) {
        setUser(null)
        setProfile(null)
        setIsOverride(false)
        setLoading(false)
        return
      }

      try {
        const nextProfile = await fetchUserProfile(nextUser.uid)
        if (!nextProfile) {
          await firebaseSignOut(firebaseAuth)
          setUser(null)
          setProfile(null)
          setIsOverride(false)
        } else {
          setUser(nextUser)
          setProfile(nextProfile)
          setIsOverride(false)
        }
      } catch {
        setUser(null)
        setProfile(null)
        setIsOverride(false)
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [bootstrappedOverride])

  async function signIn(email: string, password: string) {
    const firebaseAuth = auth
    if (!firebaseAuth) {
      throw new Error(
        "Firebase is not configured. Copy .env.example to .env and add your Firebase keys."
      )
    }

    clearOverrideProfile()
    setIsOverride(false)

    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      email,
      password
    )
    const nextProfile = await fetchUserProfile(credential.user.uid)

    if (!nextProfile) {
      await firebaseSignOut(firebaseAuth)
      setUser(null)
      setProfile(null)
      throw new MissingStoreProfileError()
    }

    setUser(credential.user)
    setProfile(nextProfile)
    return nextProfile
  }

  function signInOverride(role: UserRole) {
    const nextProfile = createOverrideProfile(role)
    writeOverrideProfile(nextProfile)
    setUser(null)
    setProfile(nextProfile)
    setIsOverride(true)
    return nextProfile
  }

  async function signOut() {
    clearOverrideProfile()
    setIsOverride(false)
    setProfile(null)
    setUser(null)
    if (auth) {
      await firebaseSignOut(auth)
    }
  }

  const isAuthenticated =
    (isOverride && Boolean(profile)) || (Boolean(user) && Boolean(profile))

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: profile?.role ?? null,
        loading,
        configured: isFirebaseConfigured,
        isOverride,
        isAuthenticated,
        signIn,
        signInOverride,
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
