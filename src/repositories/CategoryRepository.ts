import {
  findLocalCategoryByName,
  getLocalCategory,
  listLocalCategories,
  upsertLocalCategory,
} from "@/data/categories"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type {
  CategoryRecord,
  CreateCategoryInput,
} from "@/modules/inventory/types"
import { createId } from "@/utils/id"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.CATEGORIES

export type { CategoryRecord }

/**
 * Owns the `categories` collection.
 * Prefer deactivate over delete so products are not orphaned.
 */
export class CategoryRepository {
  list(): CategoryRecord[] {
    return listLocalCategories()
  }

  getById(id: string): CategoryRecord | null {
    return getLocalCategory(id)
  }

  findByName(name: string): CategoryRecord | null {
    return findLocalCategoryByName(name)
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    const name = input.name.trim()
    if (!name) throw new Error("Category name is required.")
    if (findLocalCategoryByName(name)) {
      throw new Error("A category with that name already exists.")
    }

    const now = new Date().toISOString()
    const record: CategoryRecord = {
      id: createId("cat"),
      name,
      active: true,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    }

    return this.persist(record, true)
  }

  async save(record: CategoryRecord): Promise<CategoryRecord> {
    const next: CategoryRecord = {
      ...record,
      name: record.name.trim(),
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, false)
  }

  async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ): Promise<CategoryRecord | null> {
    const existing = getLocalCategory(id)
    if (!existing) return null
    return this.save({
      ...existing,
      active,
      updatedBy: actorId,
    })
  }

  private async persist(
    record: CategoryRecord,
    isNew: boolean
  ): Promise<CategoryRecord> {
    upsertLocalCategory(record)
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      isNew ? EventTypes.CATEGORY_CREATED : EventTypes.CATEGORY_UPDATED,
      record,
      record.storeId
    )
    return record
  }
}

export const categoryRepository = new CategoryRepository()
