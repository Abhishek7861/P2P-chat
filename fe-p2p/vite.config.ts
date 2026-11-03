import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const target = process.env.API_TARGET ?? 'http://localhost:8080';


export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Vite rejects unknown Host headers; this lets a Cloudflare quick tunnel (random *.trycloudflare.com name) through
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
});