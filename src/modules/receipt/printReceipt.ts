import { buildReceiptHtml, type ReceiptContext } from "./buildReceipt"

/**
 * Print via a hidden iframe — no pop-up window (avoids browser blockers).
 */
export function printReceipt(ctx: ReceiptContext): Promise<boolean> {
  return new Promise((resolve) => {
    const html = buildReceiptHtml(ctx)
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.setAttribute("title", "Receipt print")
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    })

    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = win?.document
    if (!win || !doc) {
      iframe.remove()
      resolve(false)
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      window.setTimeout(() => {
        try {
          iframe.remove()
        } catch {
          /* ignore */
        }
      }, 800)
    }

    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
        resolve(true)
      } catch {
        resolve(false)
      } finally {
        cleanup()
      }
    }, 150)
  })
}
