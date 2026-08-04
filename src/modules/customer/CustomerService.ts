import {
  customerRepository,
  type CustomerRecord,
} from "@/repositories/CustomerRepository"

/** Customer business module — repository only. */
export class CustomerService {
  static save(record: CustomerRecord, isNew = true) {
    return customerRepository.save(record, isNew)
  }
}
