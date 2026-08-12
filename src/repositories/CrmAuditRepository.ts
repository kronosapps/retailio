import {
  appendLocalCrmAudit,
  listLocalCrmAudit,
  type CrmAuditKind,
  type CrmAuditRecord,
} from "@/data/crmAudit"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.CRM_AUDIT

export type { CrmAuditRecord, CrmAuditKind }

export class CrmAuditRepository {
  list(customerId?: string): CrmAuditRecord[] {
    return listLocalCrmAudit(customerId)
  }

  async append(input: {
    customerId: string
    customerName: string
    kind: CrmAuditKind
    message: string
    delta?: number | null
    balanceAfter?: number | null
    referenceId?: string | null
    actorId?: string | null
    storeId?: string | null
  }): Promise<CrmAuditRecord> {
    const record: CrmAuditRecord = {
      id: createId("cau"),
      customerId: input.customerId,
      customerName: input.customerName,
      kind: input.kind,
      message: input.message,
      delta: input.delta ?? null,
      balanceAfter: input.balanceAfter ?? null,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId ?? null,
      storeId: input.storeId ?? null,
      createdAt: new Date().toISOString(),
    }
    appendLocalCrmAudit(record)
    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      EventTypes.CRM_AUDIT_RECORDED,
      record,
      record.storeId
    )
    return record
  }

  async hydrate(): Promise<CrmAuditRecord[]> {
    const remote = await listDocuments<CrmAuditRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        appendLocalCrmAudit(row)
      }
    }
    return this.list()
  }
}

export const crmAuditRepository = new CrmAuditRepository()
