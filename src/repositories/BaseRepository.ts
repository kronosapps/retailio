import type { CollectionName } from "@/services/firebase"
import {
  createDocument,
  deleteDocument,
  getCollection,
  getDocument,
  queryCollection,
  updateDocument,
  upsertDocument,
} from "@/services/firebase"
import type { BaseDocument } from "@/types/documents"
import type { DocumentData, QueryConstraint, UpdateData } from "firebase/firestore"

/**
 * Abstract repository foundation.
 * Concrete repositories (Invoice, Payment, …) will extend this class
 * and pass their Firestore collection constant from COLLECTIONS.
 *
 * Do not put RetailOS UI or sync logic here — only persistence helpers.
 */
export abstract class BaseRepository<T extends BaseDocument> {
  protected abstract readonly collectionName: CollectionName

  protected nowIso(): string {
    return new Date().toISOString()
  }

  /** Create a new document (fails if helpers throw / Firebase missing). */
  async create(
    id: string,
    data: Omit<T, "id">,
  ): Promise<T> {
    const result = await createDocument<T & DocumentData>(
      this.collectionName,
      id,
      { ...data, id } as T & DocumentData
    )
    return result as T
  }

  async upsert(id: string, data: Omit<T, "id"> | T): Promise<T> {
    const result = await upsertDocument<T & DocumentData>(
      this.collectionName,
      id,
      { ...data, id } as T & DocumentData
    )
    return result as T
  }

  async update(id: string, data: UpdateData<T & DocumentData>): Promise<void> {
    await updateDocument<T & DocumentData>(this.collectionName, id, data)
  }

  async delete(id: string): Promise<void> {
    await deleteDocument(this.collectionName, id)
  }

  async getById(id: string): Promise<T | null> {
    const doc = await getDocument<T & DocumentData>(this.collectionName, id)
    return doc as T | null
  }

  async list(): Promise<T[]> {
    const rows = await getCollection<T & DocumentData>(this.collectionName)
    return rows as T[]
  }

  async query(...constraints: QueryConstraint[]): Promise<T[]> {
    const rows = await queryCollection<T & DocumentData>(
      this.collectionName,
      ...constraints
    )
    return rows as T[]
  }
}
