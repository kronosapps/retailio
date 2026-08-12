import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
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

async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * End-to-end: Supplier → PO → GRN → Invoice → Supplier pay → POS sale →
 * stock / banking / COGS journals via real EventBus + engines.
 */
describe("ERP chain — purchase + inventory + sales", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("posts the full chain with COGS and banking", async () => {
    const { accountingEngine } = await import(
      "@/modules/accounting/AccountingEngine"
    )
    const { bankingEngine } = await import("@/modules/banking/BankingEngine")
    const { inventoryEngine } = await import(
      "@/modules/inventory/InventoryEngine"
    )
    accountingEngine.start()
    bankingEngine.start()
    inventoryEngine.start()

    try {
      const { ProductService } = await import(
        "@/modules/products/ProductService"
      )
      const { SupplierService } = await import(
        "@/modules/supplier/SupplierService"
      )
      const { PurchaseOrderService } = await import(
        "@/modules/purchasing/PurchaseOrderService"
      )
      const { PurchaseReceivingService } = await import(
        "@/modules/purchasing/PurchaseReceivingService"
      )
      const { SupplierInvoiceService } = await import(
        "@/modules/purchasing/SupplierInvoiceService"
      )
      const { SupplierPaymentService } = await import(
        "@/modules/purchasing/SupplierPaymentService"
      )
      const { InventoryService } = await import(
        "@/modules/inventory/InventoryService"
      )
      const { InvoiceService } = await import(
        "@/modules/invoice/InvoiceService"
      )
      const { paymentRepository } = await import(
        "@/repositories/PaymentRepository"
      )
      const { invoiceRepository } = await import(
        "@/repositories/InvoiceRepository"
      )
      const { journalRepository } = await import(
        "@/repositories/JournalRepository"
      )
      const { BankingService } = await import(
        "@/modules/banking/BankingService"
      )
      const { ACCOUNT_CODES } = await import(
        "@/modules/accounting/chartOfAccounts"
      )
      const { rupeesToPaisa } = await import("@/lib/money")

      await ProductService.create({
        name: "ERP Barfi",
        sku: "ERP-SKU-1",
        category: "Sweets",
        sellingPrice: 100,
        costPrice: 40,
        storeId: "store-erp",
        actorId: "t",
      })

      const supplier = await SupplierService.create(
        { name: "ERP Supplier", storeId: "store-erp" },
        "t"
      )

      const po = await PurchaseOrderService.create({
        supplierId: supplier.id,
        lines: [{ sku: "ERP-SKU-1", quantityOrdered: 10, unitCostRupees: 40 }],
        storeId: "store-erp",
        actorId: "t",
        issue: true,
      })
      expect(po.status).toBe("ISSUED")

      const grn = await PurchaseReceivingService.receiveAgainstPo({
        purchaseOrderId: po.id,
        lines: [{ sku: "ERP-SKU-1", quantity: 10, unitCostRupees: 40 }],
        actorId: "t",
      })
      expect(grn.status).toBe("POSTED")
      expect(InventoryService.getCurrentStock("ERP-SKU-1")).toBe(10)

      const pin = await SupplierInvoiceService.createFromGrns({
        goodsReceiptIds: [grn.id],
        actorId: "t",
        issueAndPost: true,
        defaultGstRate: 0,
      })
      await flushAsync()
      expect(pin.status).toBe("POSTED")

      const pinJe = journalRepository.getByReference(
        "purchase_invoice",
        pin.id
      )
      expect(pinJe).toBeTruthy()
      expect(
        pinJe!.lines.some(
          (l) =>
            l.accountCode === ACCOUNT_CODES.INVENTORY && l.debitPaisa === 40000
        )
      ).toBe(true)

      await SupplierPaymentService.payInvoice({
        purchaseInvoiceId: pin.id,
        amountRupees: 400,
        method: "UPI",
        actorId: "t",
      })
      await flushAsync()

      const bankAfterPay = BankingService.getSnapshot()
      expect(
        bankAfterPay.entries.some(
          (e) => e.source === "supplier_payment" && e.direction === "out"
        )
      ).toBe(true)
      expect(bankAfterPay.totals.upiOutPaisa).toBeGreaterThanOrEqual(40000)

      const sale = await InvoiceService.create({
        cashierId: "t",
        cashierName: "Tester",
        storeId: "store-erp",
        customerName: "Walk-in",
        lines: [
          {
            itemId: "ERP-SKU-1",
            sku: "ERP-SKU-1",
            name: "ERP Barfi",
            weight: "1pc",
            qty: 3,
            unitPricePaisa: rupeesToPaisa(100),
            lineTotalPaisa: rupeesToPaisa(300),
          },
        ],
        totals: {
          grossSubtotal: rupeesToPaisa(300),
          friendsFamilyDiscount: 0,
          friendsFamilyPercent: 0,
          occasionDiscount: 0,
          occasionPercent: 0,
          occasionName: null,
          loyaltyDiscount: 0,
          loyaltyLabel: null,
          taxableAmount: rupeesToPaisa(300),
          gstAmount: 0,
          gstPercent: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          cgstPercent: 0,
          sgstPercent: 0,
          total: rupeesToPaisa(300),
        },
        loyalty: { mode: "off", freeItemId: null, freeItemName: null },
      })

      await paymentRepository.save({
        paymentId: "PAY-ERP-1",
        invoiceId: sale.invoiceId,
        invoiceNumber: sale.invoiceId,
        transactionReference: "TXN-ERP-1",
        merchantUPI: "shop@upi",
        merchantName: "RetailOS",
        amountPaisa: sale.totals.total,
        amount: 300,
        currency: "INR",
        paymentMethod: "Cash",
        status: "Paid",
        createdAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        remarks: null,
        upiUrl: null,
        qrGeneratedAt: null,
        qrExpiresAt: null,
        customerName: "Walk-in",
        storeId: "store-erp",
        attempt: 1,
        upiTxnLast4: null,
        cashReceiptNumber: 1,
        cashReceiptId: "CASH-ERP-1",
      })
      await invoiceRepository.updatePaymentFields(sale.invoiceId, {
        paymentId: "PAY-ERP-1",
        paymentStatus: "Paid",
        paymentMethod: "Cash",
      })
      await flushAsync()

      expect(InventoryService.getCurrentStock("ERP-SKU-1")).toBe(7)

      const saleJe = journalRepository.getByReference("sale", sale.invoiceId)
      expect(saleJe).toBeTruthy()
      const cogsLine = saleJe!.lines.find(
        (l) => l.accountCode === ACCOUNT_CODES.COGS && l.debitPaisa > 0
      )
      expect(cogsLine?.debitPaisa).toBe(3 * rupeesToPaisa(40))
      const invCredit = saleJe!.lines.find(
        (l) =>
          l.accountCode === ACCOUNT_CODES.INVENTORY && l.creditPaisa > 0
      )
      expect(invCredit?.creditPaisa).toBe(3 * rupeesToPaisa(40))

      const bankAfterSale = BankingService.getSnapshot()
      expect(bankAfterSale.balances.cashPaisa).toBeGreaterThan(
        bankAfterPay.balances.cashPaisa
      )
    } finally {
      accountingEngine.stop()
      bankingEngine.stop()
      inventoryEngine.stop()
    }
  })
})
