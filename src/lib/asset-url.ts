/** Prefix public asset paths with Vite base (e.g. /retailio/ on GitHub Pages). */
export function assetUrl(path: string): string {
  if (!path) return path
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path

  const base = import.meta.env.BASE_URL || "/"
  const normalized = path.startsWith("/") ? path.slice(1) : path
  return `${base}${normalized}`
}
