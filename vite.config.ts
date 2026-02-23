import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /**
       * Path alias: "@/" maps to "./src/" for clean imports.
       * Mirrors the tsconfig "paths" config so both TS compiler
       * and Vite bundler resolve identically.
       */
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
