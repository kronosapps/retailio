import {
  doc,
  setDoc,
  type DocumentData,
} from "firebase/firestore"

import { db, isFirebaseConfigured } from "@/firebase"

/**
 * Best-effort Firestore write.
 * When Firebase is unset, or the write fails (e.g. permission-denied while
 * using local auth), callers still succeed via local persistence.
 */
export async function upsertDocument(
  collectionName: string,
  id: string,
  data: DocumentData
): Promise<"firestore" | "local-only"> {
  if (!isFirebaseConfigured || !db) return "local-only"

  try {
    await setDoc(doc(db, collectionName, id), data, { merge: true })
    return "firestore"
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        `[RetailOS] Firestore upsert skipped for ${collectionName}/${id}`,
        error
      )
    }
    return "local-only"
  }
}
