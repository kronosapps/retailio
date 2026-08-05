import { useNavigate } from "react-router-dom"
import {
  PackagePlus,
  ShoppingCart,
  UserPlus,
  Warehouse,
  FileBarChart2,
} from "lucide-react"

import { Button } from "@/components/ui/button"

const ACTIONS = [
  { label: "New sale", to: "/pos", icon: ShoppingCart },
  { label: "Add product", to: "/inventory", icon: PackagePlus },
  { label: "Receive stock", to: "/inventory", icon: Warehouse },
  { label: "Add customer", to: "/inventory", icon: UserPlus },
  { label: "Reports", to: "/", icon: FileBarChart2 },
] as const

export function QuickActions() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ label, to, icon: Icon }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(to)}
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  )
}
