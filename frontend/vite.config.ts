import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.FRONTEND_PORT || 5173),
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: internalApiUrl,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
