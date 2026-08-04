import { MissingStoreProfileError, parseUserProfile } from "@/lib/user-profile"
import type { UserProfile } from "@/types/user"

import { COLLECTIONS } from "./collections"
import { getDocument } from "./firestore"

/**
 * Load RetailOS staff profile from Firestore users/{uid}.
 * Document shape: { email, displayName, role, storeId, ... }
 */
export async function fetchUserProfile(uid: string): Promise<UserProfile> {
  const doc = await getDocument(COLLECTIONS.USERS, uid)
  if (!doc) {
    throw new MissingStoreProfileError()
  }

  const profile = parseUserProfile(doc)
  if (!profile) {
    throw new MissingStoreProfileError()
  }

  return profile
}
