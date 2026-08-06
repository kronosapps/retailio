import { Navigate, Route, Routes } from "react-router-dom"

import { RequireAdmin } from "@/components/RequireAdmin"
import { RequireAuth } from "@/components/RequireAuth"
import { RequireGuest } from "@/components/RequireGuest"
import { AppLayout } from "@/layouts/AppLayout"
import { PosLayout } from "@/layouts/PosLayout"
import { CustomersPage } from "@/pages/CustomersPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { InventoryPage } from "@/pages/InventoryPage"
import { InvoiceDetailsPage } from "@/pages/InvoiceDetailsPage"
import { LoginPage } from "@/pages/LoginPage"
import { OptionsPage } from "@/pages/OptionsPage"
import { PosPage } from "@/pages/PosPage"
import { TransactionsPage } from "@/pages/TransactionsPage"

export default function App() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<PosLayout />}>
          <Route path="/pos" element={<PosPage />} />
        </Route>

        <Route element={<AppLayout />}>
          <Route element={<RequireAdmin />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/invoices/:invoiceId" element={<InvoiceDetailsPage />} />
            <Route path="/options" element={<OptionsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
