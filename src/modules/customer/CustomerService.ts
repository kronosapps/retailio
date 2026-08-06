import {
  customerRepository,
  type CreateCustomerInput,
  type CustomerRecord,
  type UpsertCheckoutCustomerInput,
} from "@/repositories/CustomerRepository"

/**
 * Customer business module.
 * UI → CustomerService → CustomerRepository → Firestore/local → EventBus → Sheets.
 */
export class CustomerService {
  static list(): CustomerRecord[] {
    return customerRepository.list()
  }

  static getById(id: string): CustomerRecord | null {
    return customerRepository.getById(id)
  }

  static findByPhone(phone: string, storeId?: string | null) {
    return customerRepository.findByPhone(phone, storeId)
  }

  static create(input: CreateCustomerInput, actorId: string | null = null) {
    return customerRepository.create(input, actorId)
  }

  static save(record: CustomerRecord, isNew = false) {
    return customerRepository.save(record, isNew)
  }

  static delete(id: string) {
    return customerRepository.delete(id)
  }

  /** Used by Payment Module on Mark Paid. */
  static upsertFromCheckout(input: UpsertCheckoutCustomerInput) {
    return customerRepository.upsertFromCheckout(input)
  }
}

export type { CreateCustomerInput, CustomerRecord }
