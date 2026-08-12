/**
 * Wipe RetailOS Firestore collections, keeping `users`.
 *
 * Usage:
 *   npm run db:wipe
 *   npm run db:wipe -- --force
 *
 * Requires Firebase CLI logged in to the target project:
 *   npm i -g firebase-tools
 *   firebase login
 *   firebase use retailio-7586e
 */

import { spawnSync } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

/** Collections wiped on every run. `users` is intentionally omitted. */
const COLLECTIONS_TO_WIPE = [
  "products",
  "customers",
  "suppliers",
  "purchase_orders",
  "goods_receipts",
  "purchase_invoices",
  "supplier_payments",
  "purchase_returns",
  "invoices",
  "payments",
  "refunds",
  "notifications",
  "notification_logs",
  "inventory",
  "inventory_movements",
  "inventory_lots",
  "stock_takes",
  "cashier_shifts",
  "sales_returns",
  "credit_notes",
  "promotions",
  "coupons",
  "price_history",
  "expenses",
  "journal_entries",
  "settings",
  "sync_events",
]

const KEEP = ["users"]

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`RetailOS Firestore wipe (keeps users)

Usage:
  npm run db:wipe
  npm run db:wipe:force
  node scripts/wipe-firestore.mjs [--force]

Options:
  -f, --force   Skip confirmation prompt
  -h, --help    Show this help
`)
  process.exit(0)
}

const force =
  process.argv.includes("--force") ||
  process.argv.includes("-f") ||
  process.env.FIRESTORE_WIPE_FORCE === "1"

function runFirebase(args) {
  const result = spawnSync("firebase", args, {
    stdio: "inherit",
    shell: true,
    encoding: "utf8",
  })
  return result.status ?? 1
}

async function confirmOrExit() {
  if (force) return

  console.log("")
  console.log("This will DELETE all documents in these Firestore collections:")
  for (const name of COLLECTIONS_TO_WIPE) {
    console.log(`  - ${name}`)
  }
  console.log("")
  console.log("Kept (not deleted):")
  for (const name of KEEP) {
    console.log(`  - ${name}`)
  }
  console.log("")
  console.log("Google Sheets and browser localStorage are NOT cleared.")
  console.log("")

  const rl = createInterface({ input, output })
  const answer = await rl.question('Type "wipe" to continue: ')
  rl.close()

  if (answer.trim().toLowerCase() !== "wipe") {
    console.log("Aborted. No data was deleted.")
    process.exit(0)
  }
}

async function main() {
  console.log("RetailOS · Firestore wipe (keep users)")
  console.log("Project must already be selected via `firebase use`.")
  console.log("")

  const projectStatus = spawnSync("firebase", ["use"], {
    encoding: "utf8",
    shell: true,
  })
  if (projectStatus.status !== 0) {
    console.error(
      "Firebase CLI project is not set. Run: firebase login && firebase use <project-id>"
    )
    process.exit(1)
  }
  const projectLine = (projectStatus.stdout || "").trim()
  if (projectLine) {
    console.log(projectLine)
  }

  await confirmOrExit()

  let failed = 0
  for (const collection of COLLECTIONS_TO_WIPE) {
    console.log(`\n→ Deleting ${collection}/ …`)
    const code = runFirebase([
      "firestore:delete",
      collection,
      "--recursive",
      "--force",
    ])
    if (code !== 0) {
      console.error(`Failed to delete collection: ${collection}`)
      failed += 1
    } else {
      console.log(`✓ ${collection}`)
    }
  }

  console.log("")
  if (failed > 0) {
    console.error(`Finished with ${failed} failure(s).`)
    process.exit(1)
  }

  console.log("Done. Firestore app data wiped; users collection kept.")
  console.log("")
  console.log("Next steps:")
  console.log("  1. Clear browser Local Storage keys starting with retailos.")
  console.log("  2. Hard-refresh the app so products reseed from products.json.")
  console.log("  3. Clear Google Sheets tabs manually if you want a clean sheet.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
