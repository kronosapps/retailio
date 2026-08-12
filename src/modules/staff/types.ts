import type { UserRole } from "@/types/user"

export type CreateStaffInput = {
  username: string
  passcode: string
  displayName: string
  role: UserRole
  storeId?: string | null
}

export type UpdateStaffInput = {
  id: string
  username?: string
  /** Empty / omitted = leave passcode unchanged. */
  passcode?: string
  /**
   * Required on Firebase when changing username or passcode (Spark path —
   * signs into a secondary app; no Cloud Functions).
   */
  currentPasscode?: string
  displayName?: string
  role?: UserRole
  active?: boolean
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
