import {
  ensureDefaultUnits,
  findLocalUnitByCode,
  getLocalUnit,
  listLocalUnits,
  upsertLocalUnit,
} from "@/data/units"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"
import type {
  CreateUnitInput,
  UnitRecord,
} from "@/modules/masterData/types"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.UNITS

export type { UnitRecord }

export class UnitRepository {
  list(): UnitRecord[] {
    ensureDefaultUnits()
    return listLocalUnits()
  }

  getById(id: string): UnitRecord | null {
    return getLocalUnit(id)
  }

  findByCode(code: string): UnitRecord | null {
    return findLocalUnitByCode(code)
  }

  async hydrate(): Promise<UnitRecord[]> {
    ensureDefaultUnits()
    const remote = await listDocuments<UnitRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id || !(row.code || row.name)) continue
        upsertLocalUnit({
          ...row,
          code: row.code || row.name,
          nameKey: row.nameKey || normalizeNameKey(row.code || row.name),
        })
      }
    }
    return this.list()
  }

  async create(input: CreateUnitInput): Promise<UnitRecord> {
    const code = input.code.trim()
    if (!code) throw new Error("Unit code is required.")
    if (findLocalUnitByCode(code)) {
      throw new Error("A unit with that code already exists.")
    }
    const now = new Date().toISOString()
    const record: UnitRecord = {
      id: createId("unit"),
      code,
      name: (input.name || code).trim(),
      nameKey: normalizeNameKey(code),
      active: true,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy ?? null,
      updatedBy: input.createdBy ?? null,
    }
    return this.persist(record, true)
  }

  async save(record: UnitRecord): Promise<UnitRecord> {
    const code = record.code.trim()
    if (!code) throw new Error("Unit code is required.")
    const clash = findLocalUnitByCode(code)
    if (clash && clash.id !== record.id) {
      throw new Error("A unit with that code already exists.")
    }
    return this.persist(
      {
        ...record,
        code,
        name: (record.name || code).trim(),
        nameKey: normalizeNameKey(code),
        updatedAt: new Date().toISOString(),
      },
      false
    )
  }

  async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ): Promise<UnitRecord | null> {
    const existing = getLocalUnit(id)
    if (!existing) return null
    return this.save({
      ...existing,
      active,
      updatedBy: actorId,
    })
  }

  async ensure(
    code: string,
    storeId: string | null = null,
    actorId: string | null = null
  ): Promise<UnitRecord> {
    const trimmed = code.trim()
    if (!trimmed) throw new Error("Unit code is required.")
    const existing = findLocalUnitByCode(trimmed)
    if (existing) {
      if (!existing.active) {
        return (await this.setActive(existing.id, true, actorId))!
      }
      return existing
    }
    return this.create({ code: trimmed, storeId, createdBy: actorId })
  }

  private async persist(
    record: UnitRecord,
    isNew: boolean
  ): Promise<UnitRecord> {
    upsertLocalUnit(record)
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      isNew ? EventTypes.UNIT_CREATED : EventTypes.UNIT_UPDATED,
      record,
      record.storeId
    )
    return record
  }
}

export const unitRepository = new UnitRepository()
