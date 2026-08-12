import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/core/firebase", () => ({
  isFirebaseConfigured: false,
  currentUser: () => null,
  createFirebaseStaffUser: vi.fn(),
  getCollection: vi.fn(),
  getFirebaseFunctions: vi.fn(),
  COLLECTIONS: { USERS: "users" },
  AppFirebaseError: class extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
  upsertDocument: vi.fn(),
}))

vi.mock("@/modules/audit", () => ({
  AuditService: { record: vi.fn(async () => undefined) },
}))

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

describe("StaffService local CRUD", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("creates, updates, and soft-deletes staff", async () => {
    const { StaffService } = await import("@/modules/staff/StaffService")

    const created = await StaffService.create({
      username: "clerk_a",
      passcode: "secret12",
      displayName: "Clerk A",
      role: "cashier",
    })
    expect(created.username).toBe("clerk_a")

    const listed = await StaffService.list()
    expect(listed.some((s) => s.username === "clerk_a")).toBe(true)

    const updated = await StaffService.update({
      id: created.id,
      username: "clerk_b",
      displayName: "Clerk B",
      role: "manager",
      passcode: "newpass99",
      active: true,
    })
    expect(updated.username).toBe("clerk_b")
    expect(updated.role).toBe("manager")

    await StaffService.remove(created.id)
    const after = await StaffService.getById(created.id)
    expect(after?.active).toBe(false)
  })
})
