import ExcelJS from "exceljs"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
} from "@/modules/productImport/types"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
}))

vi.mock("@/events/EventPublisher", () => ({
  EventPublisher: {
    publish: vi.fn(async () => undefined),
  },
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

async function workbookBuffer(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook()
  build(wb)
  return wb.xlsx.writeBuffer()
}

describe("Product import template", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("generates Products, Instructions, Data Dictionary, Meta with version", async () => {
    const { ProductTemplateGenerator } = await import(
      "@/modules/productImport/template/ProductTemplateGenerator"
    )
    const wb = await ProductTemplateGenerator.buildWorkbook()
    expect(wb.getWorksheet("Products")).toBeTruthy()
    expect(wb.getWorksheet("Instructions")).toBeTruthy()
    expect(wb.getWorksheet("Data Dictionary")).toBeTruthy()
    const meta = wb.getWorksheet("Meta")
    expect(meta).toBeTruthy()
    expect(String(meta!.getCell(2, 2).value)).toBe(
      PRODUCT_IMPORT_TEMPLATE_VERSION
    )

    const headers: string[] = []
    wb.getWorksheet("Products")!.getRow(1).eachCell((cell) => {
      headers.push(String(cell.value))
    })
    expect(headers).toEqual([...PRODUCT_IMPORT_COLUMNS])
    expect(wb.getWorksheet("Products")!.rowCount).toBeGreaterThanOrEqual(2)
  })
})

describe("ExcelProductParser", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("parses a valid workbook and trims whitespace", async () => {
    const { ExcelProductParser } = await import(
      "@/modules/productImport/parser/ExcelProductParser"
    )
    const buffer = await workbookBuffer((wb) => {
      const products = wb.addWorksheet("Products")
      products.addRow([...PRODUCT_IMPORT_COLUMNS])
      products.addRow([
        "  new-sku-1 ",
        "",
        "  Dairy Milk ",
        "Chocolate",
        "",
        1,
        "1",
        40,
        50,
        50,
        5,
        "",
        10,
        "Yes",
      ])
      const meta = wb.addWorksheet("Meta")
      meta.addRow(["Key", "Value"])
      meta.addRow(["Template Version", PRODUCT_IMPORT_TEMPLATE_VERSION])
    })

    const parsed = await ExcelProductParser.parseBuffer(buffer as ArrayBuffer)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]!.sku).toBe("new-sku-1")
    expect(parsed.rows[0]!.name).toBe("Dairy Milk")
    expect(parsed.rows[0]!.sellingPrice).toBe(50)
  })

  it("rejects missing Products sheet", async () => {
    const { ExcelProductParser, ProductImportParseError } = await import(
      "@/modules/productImport/parser/ExcelProductParser"
    )
    const buffer = await workbookBuffer((wb) => {
      wb.addWorksheet("Other").addRow(["a"])
    })
    await expect(
      ExcelProductParser.parseBuffer(buffer as ArrayBuffer)
    ).rejects.toBeInstanceOf(ProductImportParseError)
  })

  it("rejects unexpected columns", async () => {
    const { ExcelProductParser, ProductImportParseError } = await import(
      "@/modules/productImport/parser/ExcelProductParser"
    )
    const buffer = await workbookBuffer((wb) => {
      const products = wb.addWorksheet("Products")
      products.addRow(["SKU", "Product Name", "Price"])
      const meta = wb.addWorksheet("Meta")
      meta.addRow(["Key", "Value"])
      meta.addRow(["Template Version", PRODUCT_IMPORT_TEMPLATE_VERSION])
    })
    await expect(
      ExcelProductParser.parseBuffer(buffer as ArrayBuffer)
    ).rejects.toBeInstanceOf(ProductImportParseError)
  })

  it("rejects unsupported template version", async () => {
    const { ExcelProductParser, ProductImportParseError } = await import(
      "@/modules/productImport/parser/ExcelProductParser"
    )
    const buffer = await workbookBuffer((wb) => {
      const products = wb.addWorksheet("Products")
      products.addRow([...PRODUCT_IMPORT_COLUMNS])
      const meta = wb.addWorksheet("Meta")
      meta.addRow(["Key", "Value"])
      meta.addRow(["Template Version", "9.9"])
    })
    await expect(
      ExcelProductParser.parseBuffer(buffer as ArrayBuffer)
    ).rejects.toBeInstanceOf(ProductImportParseError)
  })
})

describe("ProductImportValidator", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("flags missing fields, negative price, file duplicates, and existing SKUs", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { ProductImportValidator } = await import(
      "@/modules/productImport/validation/ProductImportValidator"
    )

    await ProductService.create({
      name: "Existing",
      sku: "EXIST-1",
      category: "Test",
      sellingPrice: 10,
      storeId: null,
      actorId: "t",
    })

    const preview = ProductImportValidator.validate(
      [
        {
          rowNumber: 2,
          sku: "",
          barcode: null,
          name: "",
          category: "",
          brand: null,
          unitSize: null,
          unit: null,
          costPrice: null,
          sellingPrice: null,
          mrp: null,
          gstRate: null,
          hsnCode: null,
          reorderLevel: null,
          active: true,
        },
        {
          rowNumber: 3,
          sku: "DUP-A",
          barcode: null,
          name: "A",
          category: "C",
          brand: null,
          unitSize: 1,
          unit: "1",
          costPrice: null,
          sellingPrice: -5,
          mrp: null,
          gstRate: null,
          hsnCode: null,
          reorderLevel: null,
          active: true,
        },
        {
          rowNumber: 4,
          sku: "NEW-1",
          barcode: null,
          name: "New One",
          category: "C",
          brand: null,
          unitSize: 1,
          unit: "1",
          costPrice: 10,
          sellingPrice: 20,
          mrp: null,
          gstRate: 5,
          hsnCode: null,
          reorderLevel: 5,
          active: true,
        },
        {
          rowNumber: 5,
          sku: "NEW-1",
          barcode: null,
          name: "New One Dup",
          category: "C",
          brand: null,
          unitSize: 1,
          unit: "1",
          costPrice: 10,
          sellingPrice: 20,
          mrp: null,
          gstRate: 5,
          hsnCode: null,
          reorderLevel: 5,
          active: true,
        },
        {
          rowNumber: 6,
          sku: "EXIST-1",
          barcode: null,
          name: "Clash",
          category: "C",
          brand: null,
          unitSize: 1,
          unit: "1",
          costPrice: null,
          sellingPrice: 15,
          mrp: null,
          gstRate: 0,
          hsnCode: null,
          reorderLevel: 10,
          active: true,
        },
      ],
      PRODUCT_IMPORT_TEMPLATE_VERSION
    )

    expect(preview.rows[0]!.status).toBe("INVALID")
    expect(preview.rows[1]!.status).toBe("INVALID")
    expect(preview.rows[2]!.status).toBe("NEW")
    expect(preview.rows[3]!.status).toBe("DUPLICATE")
    expect(preview.rows[4]!.status).toBe("DUPLICATE")
    expect(preview.newRows).toBe(1)
  })
})

describe("ProductImportService push safety", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("imports only NEW rows through ProductService and skips duplicates", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { ProductImportService } = await import(
      "@/modules/productImport/services/ProductImportService"
    )
    const { EventPublisher } = await import("@/events/EventPublisher")

    await ProductService.create({
      name: "Seed",
      sku: "SEED-1",
      category: "Test",
      sellingPrice: 10,
      storeId: null,
      actorId: "t",
    })

    const createSpy = vi.spyOn(ProductService, "create")

    const result = await ProductImportService.pushToFirestore(
      {
        templateVersion: PRODUCT_IMPORT_TEMPLATE_VERSION,
        totalRows: 2,
        validRows: 1,
        invalidRows: 0,
        duplicateRows: 1,
        newRows: 1,
        rows: [
          {
            rowNumber: 2,
            sku: "IMPORT-OK",
            barcode: null,
            name: "Imported Ok",
            category: "Snacks",
            brand: "Brand",
            unitSize: 1,
            unit: "1",
            costPrice: 8,
            sellingPrice: 12,
            mrp: 12,
            gstRate: 5,
            hsnCode: "1234",
            reorderLevel: 4,
            active: true,
            status: "NEW",
            messages: [],
          },
          {
            rowNumber: 3,
            sku: "SEED-1",
            barcode: null,
            name: "Skip me",
            category: "Test",
            brand: null,
            unitSize: 1,
            unit: "1",
            costPrice: null,
            sellingPrice: 10,
            mrp: null,
            gstRate: 0,
            hsnCode: null,
            reorderLevel: 10,
            active: true,
            status: "DUPLICATE",
            messages: ["exists"],
          },
        ],
      },
      { storeId: "store-1", actorId: "importer" }
    )

    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(ProductService.getById("IMPORT-OK")?.name).toBe("Imported Ok")
    expect(ProductService.getById("IMPORT-OK")?.brand).toBe("Brand")
    expect(EventPublisher.publish).toHaveBeenCalled()
  })

  it("does not write when only validating/parsing", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { ProductImportService } = await import(
      "@/modules/productImport/services/ProductImportService"
    )
    const { ExcelProductParser } = await import(
      "@/modules/productImport/parser/ExcelProductParser"
    )
    const { ProductImportValidator } = await import(
      "@/modules/productImport/validation/ProductImportValidator"
    )

    const before = ProductService.list().length
    const buffer = await workbookBuffer((wb) => {
      const products = wb.addWorksheet("Products")
      products.addRow([...PRODUCT_IMPORT_COLUMNS])
      products.addRow([
        "PARSE-ONLY",
        "",
        "Parse Only",
        "Test",
        "",
        1,
        "1",
        "",
        99,
        "",
        0,
        "",
        10,
        "Yes",
      ])
      const meta = wb.addWorksheet("Meta")
      meta.addRow(["Key", "Value"])
      meta.addRow(["Template Version", PRODUCT_IMPORT_TEMPLATE_VERSION])
    })
    const parsed = await ExcelProductParser.parseBuffer(buffer as ArrayBuffer)
    const preview = ProductImportValidator.validate(
      parsed.rows,
      parsed.templateVersion
    )
    expect(preview.newRows).toBe(1)
    expect(ProductService.list().length).toBe(before)
    expect(typeof ProductImportService.parseAndValidate).toBe("function")
  })
})
