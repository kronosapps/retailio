import {
  appendLocalOpsAudit,
  listLocalOpsAudit,
} from "@/data/opsAudit"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"
import type {
  OpsAuditKind,
  OpsAuditRecord,
  RecordOpsAuditInput,
} from "@/modules/audit/types"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.OPS_AUDIT

export type { OpsAuditRecord, OpsAuditKind, RecordOpsAuditInput }

/**
 * Owns `ops_audit` (local + Firestore mirror).
 * Append-only — never mutate historical rows from UI.
 */
export class OpsAuditRepository {
  list(): OpsAuditRecord[] {
    return listLocalOpsAudit()
  }

  async append(input: RecordOpsAuditInput): Promise<OpsAuditRecord> {
    const record: OpsAuditRecord = {
      id: createId("oau"),
      kind: input.kind,
      message: input.message.trim() || input.kind,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      storeId: input.storeId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      meta: input.meta ?? {},
      sourceEventId: input.sourceEventId ?? null,
      sourceEventType: input.sourceEventType ?? null,
      createdAt: input.createdAt || new Date().toISOString(),
    }
    appendLocalOpsAudit(record)
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      EventTypes.AUDIT_RECORDED,
      {
        id: record.id,
        kind: record.kind,
        actorId: record.actorId,
        entityId: record.entityId,
        createdAt: record.createdAt,
      },
      record.storeId
    )
    return record
  }

  async hydrate(): Promise<OpsAuditRecord[]> {
    const remote = await listDocuments<OpsAuditRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        appendLocalOpsAudit(row)
      }
    }
    return this.list()
  }
}

export const opsAuditRepository = new OpsAuditRepository()
