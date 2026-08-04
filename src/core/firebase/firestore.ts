import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  writeBatch,
  runTransaction as firestoreRunTransaction,
  type DocumentData,
  type QueryConstraint,
  type Transaction,
  type WithFieldValue,
  type UpdateData,
} from "firebase/firestore"

import { toAppFirebaseError } from "./errors"
import { getFirestoreDb } from "./firebase"

function colRef(collectionName: string) {
  return collection(getFirestoreDb(), collectionName)
}

function docRef(collectionName: string, id: string) {
  return doc(getFirestoreDb(), collectionName, id)
}

/**
 * Generic Firestore helpers — no RetailOS domain logic.
 * Always import collection names from `./collections`.
 */

export async function createDocument<T extends DocumentData>(
  collectionName: string,
  id: string,
  data: WithFieldValue<T>
): Promise<T & { id: string }> {
  try {
    await setDoc(docRef(collectionName, id), data)
    return { ...(data as T), id }
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  id: string,
  data: UpdateData<T>
): Promise<void> {
  try {
    await updateDoc(docRef(collectionName, id), data)
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function deleteDocument(
  collectionName: string,
  id: string
): Promise<void> {
  try {
    await deleteDoc(docRef(collectionName, id))
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function getDocument<T extends DocumentData>(
  collectionName: string,
  id: string
): Promise<(T & { id: string }) | null> {
  try {
    const snap = await getDoc(docRef(collectionName, id))
    if (!snap.exists()) return null
    return { id: snap.id, ...(snap.data() as T) }
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function getCollection<T extends DocumentData>(
  collectionName: string
): Promise<Array<T & { id: string }>> {
  try {
    const snap = await getDocs(colRef(collectionName))
    return snap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as T),
    }))
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function queryCollection<T extends DocumentData>(
  collectionName: string,
  ...constraints: QueryConstraint[]
): Promise<Array<T & { id: string }>> {
  try {
    const snap = await getDocs(query(colRef(collectionName), ...constraints))
    return snap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as T),
    }))
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function runTransaction<T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> {
  try {
    return await firestoreRunTransaction(getFirestoreDb(), updateFunction)
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

export async function batchWrite(
  operations: Array<
    | {
        type: "set"
        collectionName: string
        id: string
        data: WithFieldValue<DocumentData>
        merge?: boolean
      }
    | {
        type: "update"
        collectionName: string
        id: string
        data: UpdateData<DocumentData>
      }
    | { type: "delete"; collectionName: string; id: string }
  >
): Promise<void> {
  try {
    const batch = writeBatch(getFirestoreDb())
    for (const op of operations) {
      const ref = docRef(op.collectionName, op.id)
      if (op.type === "set") {
        batch.set(ref, op.data, { merge: op.merge ?? false })
      } else if (op.type === "update") {
        batch.update(ref, op.data)
      } else {
        batch.delete(ref)
      }
    }
    await batch.commit()
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}

/** Merge upsert helper used by repositories that need create-or-update. */
export async function upsertDocument<T extends DocumentData>(
  collectionName: string,
  id: string,
  data: WithFieldValue<T>
): Promise<T & { id: string }> {
  try {
    await setDoc(docRef(collectionName, id), data as DocumentData, {
      merge: true,
    })
    return { ...(data as T), id }
  } catch (error) {
    throw toAppFirebaseError(error)
  }
}
