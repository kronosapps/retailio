import type { UserRole } from "@/types/user"

export type CreateStaffInput = {
  username: string
  passcode: string
  displayName: string
  role: UserRole
  storeId?: string | null
}

export type StaffListItem = {
  id: string
  username: string
  email: string
  displayName: string
  role: UserRole
  storeId: string
  active: boolean
  createdAt?: string | null
}

export type CreateStaffResult = {
  id: string
  username: string
  email: string
  role: UserRole
}
