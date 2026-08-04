import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { AuthProvider } from "@/providers/AuthProvider"
import App from "./App.tsx"
import "./index.css"

const queryClient = new QueryClient()

// Vite BASE_URL is "/retailio/" in production; React Router wants no trailing slash.
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={routerBasename === "/" ? undefined : routerBasename}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
