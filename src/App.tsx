import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"

import { RequireAuth } from "@/components/RequireAuth"
import { RequireGuest } from "@/components/RequireGuest"
import { RequirePermission } from "@/components/RequirePermission"
import { AppLayout } from "@/layouts/AppLayout"
import { PosLayout } from "@/layouts/PosLayout"
import { BankingPage } from "@/pages/BankingPage"
import { CustomersPage } from "@/pages/CustomersPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { PurchasingPage } from "@/pages/PurchasingPage"
import {
  PurchasingGoodsReceivedPage,
  PurchasingIndexRedirect,
  PurchasingInvoicesPage,
  PurchasingMatchPage,
  PurchasingOrdersPage,
  PurchasingPaymentsPage,
  PurchasingQuickPage,
  PurchasingReturnsPage,
  PurchasingStatementsPage,
  PurchasingSuppliersPage,
} from "@/pages/purchasing/PurchasingSuppliersPage"
import { InventoryPage } from "@/pages/InventoryPage"
import { InventoryIndexRedirect } from "@/pages/inventory/InventoryItemsPage"
import { InventoryItemsPage } from "@/pages/inventory/InventoryItemsPage"
import { InventoryStockPage } from "@/pages/inventory/InventoryStockPage"
import { InventoryMovementsPage } from "@/pages/inventory/InventoryMovementsPage"
import { InventoryCategoriesPage } from "@/pages/inventory/InventoryCategoriesPage"
import { BulkProductImportPage } from "@/pages/inventory/BulkProductImportPage"
import {
  InventoryLotsPage,
  InventoryOpeningPage,
  InventoryStockTakePage,
} from "@/pages/inventory/InventoryLifecyclePages"
import { InvoiceDetailsPage } from "@/pages/InvoiceDetailsPage"
import { LoginPage } from "@/pages/LoginPage"
import { OptionsPage } from "@/pages/OptionsPage"
import { PosPage } from "@/pages/PosPage"
import { ReportsPage } from "@/pages/ReportsPage"
import { StaffPage } from "@/pages/StaffPage"
import { ShiftsPage } from "@/pages/ShiftsPage"
import { ReturnsPage } from "@/pages/ReturnsPage"
import { TransactionsPage } from "@/pages/TransactionsPage"

const UtilitiesLayout = lazy(() =>
  import("@/pages/utilities/UtilitiesLayout").then((m) => ({
    default: m.UtilitiesLayout,
  }))
)
const UtilitiesHomePage = lazy(() =>
  import("@/pages/utilities/UtilitiesHomePage").then((m) => ({
    default: m.UtilitiesHomePage,
  }))
)
const BusinessSetupPage = lazy(() =>
  import("@/pages/utilities/BusinessSetupPage").then((m) => ({
    default: m.BusinessSetupPage,
  }))
)
const FinancialYearPage = lazy(() =>
  import("@/pages/utilities/FinancialYearPage").then((m) => ({
    default: m.FinancialYearPage,
  }))
)
const BarcodeGeneratorPage = lazy(() =>
  import("@/pages/utilities/BarcodeGeneratorPage").then((m) => ({
    default: m.BarcodeGeneratorPage,
  }))
)
const RecycleBinPage = lazy(() =>
  import("@/pages/utilities/RecycleBinPage").then((m) => ({
    default: m.RecycleBinPage,
  }))
)
const ExpenseCreatePage = lazy(() =>
  import("@/pages/utilities/ExpenseCreatePage").then((m) => ({
    default: m.ExpenseCreatePage,
  }))
)
const ErpChainPage = lazy(() =>
  import("@/pages/utilities/ErpChainPage").then((m) => ({
    default: m.ErpChainPage,
  }))
)

const DaybookPage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.DaybookPage,
  }))
)
const AllTransactionsPage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.AllTransactionsPage,
  }))
)
const TrialBalancePage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.TrialBalancePage,
  }))
)
const BalanceSheetPage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.BalanceSheetPage,
  }))
)
const CashFlowPage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.CashFlowPage,
  }))
)
const AccountStatementPage = lazy(() =>
  import("@/pages/utilities/AccountingPages").then((m) => ({
    default: m.AccountStatementPage,
  }))
)

const UtilityItemReportPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.UtilityItemReportPage,
  }))
)
const OperatorReportPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.OperatorReportPage,
  }))
)
const RoleReportPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.RoleReportPage,
  }))
)
const ExpenseReportPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.ExpenseReportPage,
  }))
)
const GstReportsPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.GstReportsPage,
  }))
)
const TcsReportsPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.TcsReportsPage,
  }))
)
const Form27EqPage = lazy(() =>
  import("@/pages/utilities/AnalysisPages").then((m) => ({
    default: m.Form27EqPage,
  }))
)

function UtilitiesFallback() {
  return (
    <div className="p-6 text-sm text-muted-foreground">Loading utilities…</div>
  )
}

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
            <Route path="/shifts" element={<ShiftsPage />} />
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/inventory" element={<InventoryPage />}>
              <Route index element={<InventoryIndexRedirect />} />
              <Route path="items" element={<InventoryItemsPage />} />
              <Route path="import" element={<BulkProductImportPage />} />
              <Route path="stock" element={<InventoryStockPage />} />
              <Route path="opening" element={<InventoryOpeningPage />} />
              <Route path="stock-take" element={<InventoryStockTakePage />} />
              <Route path="lots" element={<InventoryLotsPage />} />
              <Route path="movements" element={<InventoryMovementsPage />} />
              <Route path="categories" element={<InventoryCategoriesPage />} />
            </Route>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/purchasing" element={<PurchasingPage />}>
              <Route index element={<PurchasingIndexRedirect />} />
              <Route path="suppliers" element={<PurchasingSuppliersPage />} />
              <Route path="quick" element={<PurchasingQuickPage />} />
              <Route path="orders" element={<PurchasingOrdersPage />} />
              <Route
                path="goods-received"
                element={<PurchasingGoodsReceivedPage />}
              />
              <Route path="invoices" element={<PurchasingInvoicesPage />} />
              <Route path="payments" element={<PurchasingPaymentsPage />} />
              <Route path="returns" element={<PurchasingReturnsPage />} />
              <Route
                path="statements"
                element={<PurchasingStatementsPage />}
              />
              <Route path="match" element={<PurchasingMatchPage />} />
            </Route>
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/utilities"
              element={
                <Suspense fallback={<UtilitiesFallback />}>
                  <UtilitiesLayout />
                </Suspense>
              }
            >
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
              <Route path="expenses" element={<ExpenseCreatePage />} />
              <Route path="erp-chain" element={<ErpChainPage />} />
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
