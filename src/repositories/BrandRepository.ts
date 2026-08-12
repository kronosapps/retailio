import {
  findLocalBrandByName,
  getLocalBrand,
  listLocalBrands,
  upsertLocalBrand,
} from "@/data/brands"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"
import type {
  BrandRecord,
  CreateBrandInput,
} from "@/modules/masterData/types"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.BRANDS

export type { BrandRecord }

export class BrandRepository {
  list(): BrandRecord[] {
    return listLocalBrands()
  }

  getById(id: string): BrandRecord | null {
    return getLocalBrand(id)
  }

  findByName(name: string): BrandRecord | null {
    return findLocalBrandByName(name)
  }

  async hydrate(): Promise<BrandRecord[]> {
    const remote = await listDocuments<BrandRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id || !row.name) continue
        upsertLocalBrand({
          ...row,
          nameKey: row.nameKey || normalizeNameKey(row.name),
        })
      }
    }
    return this.list()
  }

  async create(input: CreateBrandInput): Promise<BrandRecord> {
    const name = input.name.trim()
    if (!name) throw new Error("Brand name is required.")
    if (findLocalBrandByName(name)) {
      throw new Error("A brand with that name already exists.")
    }
    const now = new Date().toISOString()
    const record: BrandRecord = {
      id: createId("brd"),
      name,
      nameKey: normalizeNameKey(name),
      active: true,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    }
    return this.persist(record, true)
  }

  async save(record: BrandRecord): Promise<BrandRecord> {
    const name = record.name.trim()
    if (!name) throw new Error("Brand name is required.")
    const nameKey = normalizeNameKey(name)
    const clash = findLocalBrandByName(name)
    if (clash && clash.id !== record.id) {
      throw new Error("A brand with that name already exists.")
    }
    return this.persist(
      {
        ...record,
        name,
        nameKey,
        updatedAt: new Date().toISOString(),
      },
      false
    )
  }

  async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ): Promise<BrandRecord | null> {
    const existing = getLocalBrand(id)
    if (!existing) return null
    return this.save({
      ...existing,
      active,
      updatedBy: actorId,
    })
  }

  /** Idempotent create-or-return by nameKey. */
  async ensure(
    name: string,
    storeId: string | null = null,
    actorId: string | null = null
  ): Promise<BrandRecord> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error("Brand name is required.")
    const existing = findLocalBrandByName(trimmed)
    if (existing) {
      if (!existing.active) {
        return (await this.setActive(existing.id, true, actorId))!
      }
      return existing
    }
    return this.create({ name: trimmed, storeId, createdBy: actorId })
  }

  private async persist(
    record: BrandRecord,
    isNew: boolean
  ): Promise<BrandRecord> {
    upsertLocalBrand(record)
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      isNew ? EventTypes.BRAND_CREATED : EventTypes.BRAND_UPDATED,
      record,
      record.storeId
    )
    return record
  }
}

export const brandRepository = new BrandRepository()
