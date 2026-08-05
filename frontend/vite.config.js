import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Default target ('modules', ~ES2019-equivalent baseline for browsers
    // with native ESM support) already avoids legacy-browser transpilation
    // bloat. Bumping to es2020 lets esbuild emit slightly more compact
    // output (nullish coalescing/optional chaining left as native syntax
    // instead of down-leveled) without dropping support for any browser
    // this app is realistically used in.
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('country-state-city')) return 'location-data'
          if (id.includes('@sentry')) return 'observability'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('react-router')) return 'router'
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          // lucide-react ships one ES module per icon. Importing icons by name
          // across many lazy-loaded routes made Rollup's default chunking
          // split each icon (used by 2+ routes) into its own ~300-600 byte
          // chunk -- 60+ separate HTTP requests app-wide. That's especially
          // costly for the headless-Chromium PDF renderer (/__pdf_renderer),
          // which pays the full network round-trip for every chunk on every
          // cold render. One shared chunk instead of dozens of micro-chunks.
          if (id.includes('lucide-react')) return 'icons'
          return undefined
        },
      },
    },
  }
})
