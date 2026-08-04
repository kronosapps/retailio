import {
  doc,
  setDoc,
  type DocumentData,
} from "firebase/firestore"

import { db, isFirebaseConfigured } from "@/firebase"

/**
 * Best-effort Firestore write. When Firebase is not configured,
 * repositories fall back to local persistence only (offline POS).
 */
export async function upsertDocument(
  collectionName: string,
  id: string,
  data: DocumentData
): Promise<"firestore" | "local-only"> {
  if (!isFirebaseConfigured || !db) return "local-only"
  await setDoc(doc(db, collectionName, id), data, { merge: true })
  return "firestore"
}
