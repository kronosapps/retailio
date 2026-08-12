import { FinancialYearService } from "@/modules/financialYear"
import type { FinancialYear } from "@/modules/financialYear"
import { BankingService } from "@/modules/banking"
import { formatPeriodLabel } from "@/modules/reporting/utils/report-periods"
import { journalRepository } from "@/repositories/JournalRepository"

import { AccountingProjectionService } from "./AccountingProjectionService"
import { AccountingRules } from "./rules/AccountingRules"
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS, getAccount } from "./chartOfAccounts"
import type {
  AccountStatementResult,
  BalanceSheetResult,
  CashFlowResult,
  DaybookRow,
  JournalEntry,
  JournalLine,
  ProfitAndLossResult,
  TrialBalanceResult,
} from "./types"

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

const HYBRID_NOTE =
  "Posted GL with projection backfill — not audited books. Posted entries win over projected for the same reference."

/**
 * Hybrid ledger: posted journals preferred; projection fills historical gaps.
 */
export class AccountingService {
  static async getMergedEntries(range: {
    start: Date
    end: Date
  }): Promise<JournalEntry[]> {
    const [postedAll, projected] = await Promise.all([
      Promise.resolve(journalRepository.list()),
      AccountingProjectionService.projectEntries(range),
    ])

    const posted = postedAll.filter((e) =>
      inRange(e.createdAt, range.start, range.end)
    )

    const map = new Map<string, JournalEntry>()
    for (const e of projected) {
      map.set(`${e.referenceType}:${e.referenceId}`, e)
    }
    for (const e of posted) {
      map.set(`${e.referenceType}:${e.referenceId}`, {
        ...e,
        source: "posted",
      })
    }

    return [...map.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )
  }

  static async getTrialBalance(
    fy?: FinancialYear | null
  ): Promise<TrialBalanceResult> {
    const { start, end, label } = periodFromFy(fy)
    const entries = await this.getMergedEntries({ start, end })

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
      projectionNote: HYBRID_NOTE,
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

    const pnl = await this.getProfitAndLoss(fy)
    const retained = pnl.netProfitPaisa

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
        HYBRID_NOTE,
        "Owner Capital may include balancing amounts from openings/inventory snapshot.",
        "Not a formally audited statutory balance sheet.",
      ],
    }
  }

  /**
   * Period P&L from income / expense accounts on the trial balance.
   * Single-company retail: Sales − Returns − COGS ≈ gross; then − expenses = net.
   */
  static async getProfitAndLoss(
    fy?: FinancialYear | null
  ): Promise<ProfitAndLossResult> {
    const tb = await this.getTrialBalance(fy)

    const income = tb.rows
      .filter((r) => r.accountType === "income")
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountPaisa: r.creditPaisa - r.debitPaisa,
      }))
      .filter((r) => r.amountPaisa !== 0)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))

    const expenses = tb.rows
      .filter((r) => r.accountType === "expense")
      .map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        amountPaisa: r.debitPaisa - r.creditPaisa,
      }))
      .filter((r) => r.amountPaisa !== 0)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))

    const totalIncomePaisa = income.reduce((s, r) => s + r.amountPaisa, 0)
    const totalExpensesPaisa = expenses.reduce((s, r) => s + r.amountPaisa, 0)

    const sales =
      income.find((r) => r.accountCode === ACCOUNT_CODES.SALES)?.amountPaisa ||
      0
    const salesReturns = Math.abs(
      income.find((r) => r.accountCode === ACCOUNT_CODES.SALES_RETURNS)
        ?.amountPaisa || 0
    )
    // Sales returns often reduce income (debit-normal on 4100 → negative income amount)
    const salesReturnsRow = income.find(
      (r) => r.accountCode === ACCOUNT_CODES.SALES_RETURNS
    )
    const returnsDrag =
      salesReturnsRow && salesReturnsRow.amountPaisa < 0
        ? -salesReturnsRow.amountPaisa
        : salesReturns
    const cogs =
      expenses.find((r) => r.accountCode === ACCOUNT_CODES.COGS)?.amountPaisa ||
      0
    const grossProfitPaisa = sales - returnsDrag - cogs
    const netProfitPaisa = totalIncomePaisa - totalExpensesPaisa

    return {
      asOf: tb.asOf,
      periodLabel: tb.periodLabel,
      income,
      expenses,
      totalIncomePaisa,
      totalExpensesPaisa,
      grossProfitPaisa,
      netProfitPaisa,
      notes: [
        HYBRID_NOTE,
        "Gross profit ≈ Sales − Sales returns − COGS. Net profit = total income − total expenses.",
        "Feeds Balance Sheet retained earnings for the active financial year.",
      ],
    }
  }

  /** Post a balanced manual journal into the durable GL. */
  static async postManualJournal(input: {
    description: string
    date?: string
    lines: JournalLine[]
    actorId?: string | null
    actorName?: string | null
    storeId?: string | null
  }): Promise<JournalEntry> {
    for (const line of input.lines) {
      if (!getAccount(line.accountCode)) {
        throw new Error(`Unknown account ${line.accountCode}.`)
      }
    }
    const entry = AccountingRules.fromManual({
      description: input.description,
      date: input.date,
      lines: input.lines,
      operatorId: input.actorId ?? null,
      operatorName: input.actorName ?? null,
      storeId: input.storeId ?? null,
    })
    return journalRepository.savePosted(entry)
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
        "Lightweight operating cash view from Banking (cash + UPI), not a full IAS cash-flow statement.",
        "Investing/financing sections are not modeled for single-store retail yet.",
        "Sale → Payment and Expense → Cash/UPI post to the GL via AccountingEngine.",
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

    const entries = await this.getMergedEntries({ start, end })

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
    const entries = await this.getMergedEntries({ start, end })
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

function inRange(iso: string, start: Date, end: Date) {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}
