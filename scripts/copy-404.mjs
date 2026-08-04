import { copyFileSync } from "node:fs"

copyFileSync("dist/index.html", "dist/404.html")
console.log("Created dist/404.html for GitHub Pages SPA fallback")
