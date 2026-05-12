import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        details: resolve(__dirname, 'details.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:25566',
        changeOrigin: true
      },
      '/proxy': {
        target: 'http://localhost:25566',
        changeOrigin: true
      }
    }
  }
})
