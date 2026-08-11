import {
  expenseRepository,
  type ExpenseRecord,
} from "@/repositories/ExpenseRepository"

/** Expense business module — repository only. */
export class ExpenseService {
  static list() {
    return expenseRepository.list()
  }

  static async hydrate() {
    return expenseRepository.hydrate()
  }

  static save(record: ExpenseRecord) {
    return expenseRepository.save(record)
  }
}

export type { ExpenseRecord }
