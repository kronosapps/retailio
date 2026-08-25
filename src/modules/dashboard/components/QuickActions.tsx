import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  PackagePlus,
  ShoppingCart,
  UserPlus,
  Warehouse,
  FileBarChart2,
} from "lucide-react"

import { Button } from "@/components/ui/button"

const ACTIONS = [
  { labelKey: "dashboard.quickActions.newSale", to: "/pos", icon: ShoppingCart },
  {
    labelKey: "dashboard.quickActions.addProduct",
    to: "/inventory",
    icon: PackagePlus,
  },
  {
    labelKey: "dashboard.quickActions.receiveStock",
    to: "/inventory",
    icon: Warehouse,
  },
  {
    labelKey: "dashboard.quickActions.addCustomer",
    to: "/customers",
    icon: UserPlus,
  },
  {
    labelKey: "dashboard.quickActions.dayOps",
    to: "/day-ops",
    icon: FileBarChart2,
  },
] as const

export function QuickActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ labelKey, to, icon: Icon }) => (
        <Button
          key={labelKey}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(to)}
        >
          <Icon data-icon="inline-start" />
          {t(labelKey)}
        </Button>
      ))}
    </div>
  )
}
