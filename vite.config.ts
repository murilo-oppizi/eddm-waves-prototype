import { copyFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * The map library loads its worker from a file next to its own script. In a build that script is
 * inside the app bundle in dist/assets, so the worker and the file it imports are copied there.
 */
function mapWorker(): Plugin {
  return {
    name: "map-worker",
    apply: "build",
    closeBundle() {
      for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
        copyFileSync(
          resolve(import.meta.dirname, "node_modules/maplibre-gl/dist", file),
          resolve(import.meta.dirname, "dist/assets", file)
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the build also works under a sub-path such as GitHub Pages.
  base: "./",
  plugins: [react(), tailwindcss(), mapWorker()],
  // The map library finds its worker file next to itself, so it must not be pre-bundled.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
