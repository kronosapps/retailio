import {
  supplierRepository,
  type SupplierRecord,
} from "@/repositories/SupplierRepository"

/** Supplier business module — repository only. */
export class SupplierService {
  static save(record: SupplierRecord) {
    return supplierRepository.save(record)
  }
}
