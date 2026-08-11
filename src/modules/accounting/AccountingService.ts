import { FinancialYearService } from "@/modules/financialYear"
import type { FinancialYear } from "@/modules/financialYear"

import { AccountingProjectionService } from "./AccountingProjectionService"
import { CHART_OF_ACCOUNTS, getAccount } from "./chartOfAccounts"
import type {
  AccountStatementResult,
  BalanceSheetResult,
  CashFlowResult,
  DaybookRow,
  TrialBalanceResult,
} from "./types"
import { BankingService } from "@/modules/banking"
import { formatPeriodLabel } from "@/modules/reporting/utils/report-periods"

function periodFromFy(fy?: FinancialYear | null) {
  const year = fy || FinancialYearService.getActive()
  const { start, end } = FinancialYearService.getRange(year)
  return {
    year,
    start,
    end,
    label: formatPeriodLabel(start, end),
  }
}

export class AccountingService {
  static async getTrialBalance(
    fy?: FinancialYear | null
  ): Promise<TrialBalanceResult> {
    const { start, end, label } = periodFromFy(fy)
    const entries = await AccountingProjectionService.projectEntries({
      start,
      end,
    })

    const map = new Map<string, { debit: number; credit: number }>()
    for (const account of CHART_OF_ACCOUNTS) {
      map.set(account.code, { debit: 0, credit: 0 })
    }
    for (const entry of entries) {
      for (const line of entry.lines) {
        const cur = map.get(line.accountCode) || { debit: 0, credit: 0 }
        cur.debit += line.debitPaisa
        cur.credit += line.creditPaisa
        map.set(line.accountCode, cur)
      }
    }

    const rows = [...map.entries()]
      .map(([code, bal]) => {
        const account = getAccount(code)!
        // Net into normal side
        let debit = 0
        let credit = 0
        const net = bal.debit - bal.credit
        if (account.normalBalance === "debit") {
          if (net >= 0) debit = net
          else credit = -net
        } else {
          if (net <= 0) credit = -net
          else debit = net
        }
        return {
          accountCode: code,
          accountName: account.name,
          accountType: account.type,
          debitPaisa: debit,
          creditPaisa: credit,
        }
      })
      .filter((r) => r.debitPaisa > 0 || r.creditPaisa > 0)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))

    const totalDebitPaisa = rows.reduce((s, r) => s + r.debitPaisa, 0)
    const totalCreditPaisa = rows.reduce((s, r) => s + r.creditPaisa, 0)

    return {
      asOf: end.toISOString(),
      periodLabel: label,
      rows,
      totalDebitPaisa,
      totalCreditPaisa,
      isBalanced: totalDebitPaisa === totalCreditPaisa,
      imbalancePaisa: totalDebitPaisa - totalCreditPaisa,
      projectionNote:
        "Trial balance is projected from sales, refunds, expenses, banking openings, and inventory cost snapshot — not a posted GL.",
    }
  }

  static async getBalanceSheet(
    fy?: FinancialYear | null
  ): Promise<BalanceSheetResult> {
    const tb = await this.getTrialBalance(fy)
    const assets = tb.rows
      .filter((r) => r.accountType === "asset")
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountPaisa: r.debitPaisa - r.creditPaisa,
      }))
    const liabilities = tb.rows
      .filter((r) => r.accountType === "liability")
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountPaisa: r.creditPaisa - r.debitPaisa,
      }))

    const income = tb.rows
      .filter((r) => r.accountType === "income")
      .reduce((s, r) => s + (r.creditPaisa - r.debitPaisa), 0)
    const expense = tb.rows
      .filter((r) => r.accountType === "expense")
      .reduce((s, r) => s + (r.debitPaisa - r.creditPaisa), 0)
    const retained = income - expense

    const equityBase = tb.rows
      .filter((r) => r.accountType === "equity")
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountPaisa: r.creditPaisa - r.debitPaisa,
      }))

    const equity = [
      ...equityBase,
      {
        accountCode: "3200",
        accountName: "Retained Earnings (period)",
        amountPaisa: retained,
        provisional: true,
      },
    ]

    const totalAssetsPaisa = assets.reduce((s, r) => s + r.amountPaisa, 0)
    const totalLiabilitiesPaisa = liabilities.reduce(
      (s, r) => s + r.amountPaisa,
      0
    )
    const totalEquityPaisa = equity.reduce((s, r) => s + r.amountPaisa, 0)

    return {
      asOf: tb.asOf,
      periodLabel: tb.periodLabel,
      assets,
      liabilities,
      equity,
      totalAssetsPaisa,
      totalLiabilitiesPaisa,
      totalEquityPaisa,
      isBalanced:
        totalAssetsPaisa === totalLiabilitiesPaisa + totalEquityPaisa,
      notes: [
        "Balance sheet is derived from the projected trial balance.",
        "Owner Capital may include balancing amounts from openings/inventory snapshot.",
        "Not a formally audited statutory balance sheet.",
      ],
    }
  }

  static async getCashFlow(
    fy?: FinancialYear | null
  ): Promise<CashFlowResult> {
    const { label } = periodFromFy(fy)
    const snap = BankingService.getSnapshot()
    return {
      periodLabel: label,
      openingCashPaisa: snap.opening.cashPaisa,
      openingUpiPaisa: snap.opening.upiPaisa,
      cashInPaisa: snap.totals.cashInPaisa,
      cashOutPaisa: snap.totals.cashOutPaisa,
      upiInPaisa: snap.totals.upiInPaisa,
      upiOutPaisa: snap.totals.upiOutPaisa,
      closingCashPaisa: snap.balances.cashPaisa,
      closingUpiPaisa: snap.balances.upiPaisa,
      operatingInPaisa: snap.totals.cashInPaisa + snap.totals.upiInPaisa,
      operatingOutPaisa: snap.totals.cashOutPaisa + snap.totals.upiOutPaisa,
      notes: [
        "Cash and UPI are tracked separately via the Banking module.",
        "Investing/financing classification is not yet modeled.",
      ],
    }
  }

  static async getAccountStatement(
    accountCode: string,
    fy?: FinancialYear | null
  ): Promise<AccountStatementResult> {
    const { start, end, label } = periodFromFy(fy)
    const account = getAccount(accountCode)
    if (!account) throw new Error("Unknown account.")

    const entries = await AccountingProjectionService.projectEntries({
      start,
      end,
    })

    let balance = 0
    const lines = []
    for (const entry of entries) {
      for (const jl of entry.lines) {
        if (jl.accountCode !== accountCode) continue
        if (account.normalBalance === "debit") {
          balance += jl.debitPaisa - jl.creditPaisa
        } else {
          balance += jl.creditPaisa - jl.debitPaisa
        }
        lines.push({
          date: entry.date,
          description: entry.description,
          referenceId: entry.referenceId,
          debitPaisa: jl.debitPaisa,
          creditPaisa: jl.creditPaisa,
          balancePaisa: balance,
        })
      }
    }

    return {
      accountCode,
      accountName: account.name,
      periodLabel: label,
      openingBalancePaisa: 0,
      lines,
      closingBalancePaisa: balance,
    }
  }

  static async getDaybook(fy?: FinancialYear | null): Promise<DaybookRow[]> {
    const { start, end } = periodFromFy(fy)
    const entries = await AccountingProjectionService.projectEntries({
      start,
      end,
    })
    return entries.map((e) => {
      const debit = e.lines.reduce((s, l) => s + l.debitPaisa, 0)
      const credit = e.lines.reduce((s, l) => s + l.creditPaisa, 0)
      const created = new Date(e.createdAt)
      return {
        date: e.date,
        time: created.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAt: e.createdAt,
        transactionId: e.id,
        type: e.referenceType,
        description: e.description,
        debitPaisa: debit,
        creditPaisa: credit,
        operator: e.operatorName || e.operatorId || "—",
        paymentMethod: e.paymentMethod,
        reference: e.referenceId,
      }
    })
  }

  static listAccounts() {
    return CHART_OF_ACCOUNTS
  }
}
