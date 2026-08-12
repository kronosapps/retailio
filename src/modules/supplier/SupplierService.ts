import {
  supplierRepository,
  type CreateSupplierInput,
  type SupplierRecord,
  type UpdateSupplierInput,
} from "@/repositories/SupplierRepository"
import { searchLocalSuppliers } from "@/data/suppliers"

export class SupplierError extends Error {
  code: "VALIDATION" | "NOT_FOUND"

  constructor(code: SupplierError["code"], message: string) {
    super(message)
    this.name = "SupplierError"
    this.code = code
  }
}

/**
 * Supplier master — Phase 1 of Purchasing.
 * UI → SupplierService → SupplierRepository → Firestore/local → EventBus → Sheets.
 */
export class SupplierService {
  static list(options?: { includeInactive?: boolean }): SupplierRecord[] {
    return supplierRepository.list(options)
  }

  static getById(id: string): SupplierRecord | null {
    return supplierRepository.getById(id)
  }

  static search(query: string, storeId?: string | null, limit = 20) {
    return searchLocalSuppliers(query, storeId, limit)
  }

  static hydrate() {
    return supplierRepository.hydrate()
  }

  static async create(
    input: CreateSupplierInput,
    actorId: string | null = null
  ): Promise<SupplierRecord> {
    if (!input.name.trim()) {
      throw new SupplierError("VALIDATION", "Supplier name is required.")
    }
    return supplierRepository.create(input, actorId)
  }

  static save(record: SupplierRecord, isNew = false) {
    if (!record.name.trim()) {
      throw new SupplierError("VALIDATION", "Supplier name is required.")
    }
    return supplierRepository.save(record, isNew)
  }

  static async update(input: UpdateSupplierInput): Promise<SupplierRecord> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new SupplierError("VALIDATION", "Supplier name is required.")
    }
    try {
      return await supplierRepository.update(input)
    } catch (err) {
      if (err instanceof Error && err.message === "Supplier not found.") {
        throw new SupplierError("NOT_FOUND", err.message)
      }
      throw err
    }
  }

  static setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ) {
    return supplierRepository.setActive(id, active, actorId)
  }

  static delete(id: string) {
    return supplierRepository.delete(id)
  }
}

export type { CreateSupplierInput, SupplierRecord, UpdateSupplierInput }
