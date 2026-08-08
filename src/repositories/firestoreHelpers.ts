import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type DocumentData,
} from "firebase/firestore"

import { db, isFirebaseConfigured } from "@/core/firebase"

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

/** Best-effort Firestore read. Returns null when offline / unconfigured. */
export async function getDocument<T extends DocumentData>(
  collectionName: string,
  id: string
): Promise<T | null> {
  if (!isFirebaseConfigured || !db) return null
  try {
    const snap = await getDoc(doc(db, collectionName, id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as unknown as T
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        `[RetailOS] Firestore get skipped for ${collectionName}/${id}`,
        error
      )
    }
    return null
  }
}

/**
 * Best-effort collection list.
 * Returns `null` when Firebase is unset or the read fails (so callers keep
 * local cache and can retry). Returns `[]` only on a successful empty query.
 */
export async function listDocuments<T extends DocumentData>(
  collectionName: string
): Promise<T[] | null> {
  if (!isFirebaseConfigured || !db) return null
  try {
    const snap = await getDocs(collection(db, collectionName))
    return snap.docs.map(
      (item) => ({ id: item.id, ...item.data() }) as unknown as T
    )
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        `[RetailOS] Firestore list skipped for ${collectionName}`,
        error
      )
    }
    return null
  }
}

/**
 * Best-effort Firestore delete. Local persistence is the caller's job.
 */
export async function removeDocument(
  collectionName: string,
  id: string
): Promise<"firestore" | "local-only"> {
  if (!isFirebaseConfigured || !db) return "local-only"

  try {
    await deleteDoc(doc(db, collectionName, id))
    return "firestore"
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        `[RetailOS] Firestore delete skipped for ${collectionName}/${id}`,
        error
      )
    }
    return "local-only"
  }
}
