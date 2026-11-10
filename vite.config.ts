import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the build also works under a sub-path such as GitHub Pages.
  base: "./",
  plugins: [react(), tailwindcss()],
  // The map library finds its worker file next to itself, so it must not be pre-bundled.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
