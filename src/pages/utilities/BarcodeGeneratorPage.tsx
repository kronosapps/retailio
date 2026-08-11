import { useMemo, useRef, useState } from "react"
import JsBarcode from "jsbarcode"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProductService, type ProductRecord } from "@/modules/products"
import { useAuth } from "@/providers/AuthProvider"
import { cn } from "@/lib/utils"

const selectClass = cn(
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
)

export function BarcodeGeneratorPage() {
  const { userId } = useAuth()
  const products = useMemo(() => ProductService.list().filter((p) => p.active), [])
  const [sku, setSku] = useState(products[0]?.sku || "")
  const [value, setValue] = useState(
    () => products[0]?.barcode || products[0]?.sku || ""
  )
  const [qty, setQty] = useState("1")
  const [msg, setMsg] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const product: ProductRecord | null = sku
    ? ProductService.getById(sku)
    : null

  function selectSku(nextSku: string) {
    setSku(nextSku)
    const next = ProductService.getById(nextSku)
    setValue(next?.barcode || next?.sku || "")
  }

  function generate() {
    setMsg(null)
    const code = value.trim()
    if (!code || !canvasRef.current) {
      setMsg("Enter a barcode value.")
      return
    }
    try {
      JsBarcode(canvasRef.current, code, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height: 80,
        margin: 10,
      })
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Invalid barcode value.")
    }
  }

  function printLabels() {
    generate()
    const n = Math.max(1, Math.min(50, Number(qty) || 1))
    const dataUrl = canvasRef.current?.toDataURL("image/png")
    if (!dataUrl) return
    const w = window.open("", "_blank")
    if (!w) return
    const imgs = Array.from({ length: n })
      .map(
        () =>
          `<div style="display:inline-block;margin:8px;text-align:center"><img src="${dataUrl}" /><div style="font:12px sans-serif">${product?.name || ""}</div></div>`
      )
      .join("")
    w.document.write(
      `<html><body onload="print()">${imgs}</body></html>`
    )
    w.document.close()
  }

  async function saveToProduct() {
    if (!product || !value.trim()) return
    setMsg(null)
    try {
      await ProductService.update({
        id: product.id,
        barcode: value.trim(),
        actorId: userId,
      })
      setMsg("Barcode saved to product.")
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save barcode.")
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Barcode Generator</h2>
      <div className="space-y-1">
        <Label>Product</Label>
        <select
          className={selectClass}
          value={sku}
          onChange={(e) => selectSku(e.target.value)}
        >
          {products.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Barcode value</Label>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Print quantity</Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div className="rounded-lg border bg-white p-4">
        <canvas ref={canvasRef} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={generate}>
          Generate
        </Button>
        <Button type="button" variant="secondary" onClick={printLabels}>
          Print
        </Button>
        <Button type="button" variant="outline" onClick={() => void saveToProduct()}>
          Save to product
        </Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  )
}
