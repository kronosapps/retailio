import { Navigate, Route, Routes } from "react-router-dom"

import { RequireAuth } from "@/components/RequireAuth"
import { RequireGuest } from "@/components/RequireGuest"
import { RequirePermission } from "@/components/RequirePermission"
import { AppLayout } from "@/layouts/AppLayout"
import { PosLayout } from "@/layouts/PosLayout"
import { BankingPage } from "@/pages/BankingPage"
import { CustomersPage } from "@/pages/CustomersPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { InventoryPage } from "@/pages/InventoryPage"
import { InventoryIndexRedirect } from "@/pages/inventory/InventoryItemsPage"
import { InventoryItemsPage } from "@/pages/inventory/InventoryItemsPage"
import { InventoryStockPage } from "@/pages/inventory/InventoryStockPage"
import { InventoryMovementsPage } from "@/pages/inventory/InventoryMovementsPage"
import { InventoryCategoriesPage } from "@/pages/inventory/InventoryCategoriesPage"
import { InvoiceDetailsPage } from "@/pages/InvoiceDetailsPage"
import { LoginPage } from "@/pages/LoginPage"
import { OptionsPage } from "@/pages/OptionsPage"
import { PosPage } from "@/pages/PosPage"
import { ReportsPage } from "@/pages/ReportsPage"
import { StaffPage } from "@/pages/StaffPage"
import { TransactionsPage } from "@/pages/TransactionsPage"
import { UtilitiesLayout } from "@/pages/utilities/UtilitiesLayout"
import { UtilitiesHomePage } from "@/pages/utilities/UtilitiesHomePage"
import { BusinessSetupPage } from "@/pages/utilities/BusinessSetupPage"
import { FinancialYearPage } from "@/pages/utilities/FinancialYearPage"
import { BarcodeGeneratorPage } from "@/pages/utilities/BarcodeGeneratorPage"
import { RecycleBinPage } from "@/pages/utilities/RecycleBinPage"
import {
  AccountStatementPage,
  AllTransactionsPage,
  BalanceSheetPage,
  CashFlowPage,
  DaybookPage,
  TrialBalancePage,
} from "@/pages/utilities/AccountingPages"
import {
  ExpenseReportPage,
  Form27EqPage,
  GstReportsPage,
  OperatorReportPage,
  RoleReportPage,
  TcsReportsPage,
  UtilityItemReportPage,
} from "@/pages/utilities/AnalysisPages"

export default function App() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<RequirePermission />}>
          <Route element={<PosLayout />}>
            <Route path="/pos" element={<PosPage />} />
          </Route>

          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />}>
              <Route index element={<InventoryIndexRedirect />} />
              <Route path="items" element={<InventoryItemsPage />} />
              <Route path="stock" element={<InventoryStockPage />} />
              <Route path="movements" element={<InventoryMovementsPage />} />
              <Route path="categories" element={<InventoryCategoriesPage />} />
            </Route>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/utilities" element={<UtilitiesLayout />}>
              <Route index element={<UtilitiesHomePage />} />
              <Route path="business-setup" element={<BusinessSetupPage />} />
              <Route path="financial-year" element={<FinancialYearPage />} />
              <Route path="barcode" element={<BarcodeGeneratorPage />} />
              <Route path="recycle-bin" element={<RecycleBinPage />} />
              <Route path="daybook" element={<DaybookPage />} />
              <Route
                path="all-transactions"
                element={<AllTransactionsPage />}
              />
              <Route path="trial-balance" element={<TrialBalancePage />} />
              <Route path="balance-sheet" element={<BalanceSheetPage />} />
              <Route path="cash-flow" element={<CashFlowPage />} />
              <Route
                path="account-statement"
                element={<AccountStatementPage />}
              />
              <Route path="report-item" element={<UtilityItemReportPage />} />
              <Route path="report-operator" element={<OperatorReportPage />} />
              <Route path="report-role" element={<RoleReportPage />} />
              <Route path="report-expense" element={<ExpenseReportPage />} />
              <Route path="gst" element={<GstReportsPage />} />
              <Route path="tcs" element={<TcsReportsPage />} />
              <Route path="form-27eq" element={<Form27EqPage />} />
            </Route>
            <Route
              path="/invoices/:invoiceId"
              element={<InvoiceDetailsPage />}
            />
            <Route path="/options" element={<OptionsPage />} />
            <Route path="/banking" element={<BankingPage />} />
            <Route path="/staff" element={<StaffPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
