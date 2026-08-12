import {
  customerRepository,
  type CreateCustomerInput,
  type CustomerRecord,
  type UpsertCheckoutCustomerInput,
} from "@/repositories/CustomerRepository"
import { searchLocalCustomers } from "@/data/customers"

/**
 * Customer business module.
 * UI → CustomerService → CustomerRepository → Firestore/local → EventBus → Sheets.
 */
export class CustomerService {
  static list(): CustomerRecord[] {
    return customerRepository.list()
  }

  static hydrate() {
    return customerRepository.hydrate()
  }

  static getById(id: string): CustomerRecord | null {
    return customerRepository.getById(id)
  }

  static findByPhone(phone: string, storeId?: string | null) {
    return customerRepository.findByPhone(phone, storeId)
  }

  static findByName(name: string, storeId?: string | null) {
    return customerRepository.findByName(name, storeId)
  }

  /** Autocomplete for payment checkout (name or phone). */
  static search(query: string, storeId?: string | null, limit = 8) {
    return searchLocalCustomers(query, storeId, limit)
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
