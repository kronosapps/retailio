import { defineConfig } from 'vite'
import path from "path"
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages project site: https://kronosapps.github.io/retailio/
  // Keep "/" in local `vite` so http://localhost:5173/ works.
  base: command === "build" ? "/retailio/" : "/",
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}))
