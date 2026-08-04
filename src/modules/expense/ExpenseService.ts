import {
  expenseRepository,
  type ExpenseRecord,
} from "@/repositories/ExpenseRepository"

/** Expense business module — repository only. */
export class ExpenseService {
  static save(record: ExpenseRecord) {
    return expenseRepository.save(record)
  }
}
