import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Puertos overridables por entorno (deben coincidir con backend/config.py y electron/main.js)
const FRONTEND_PORT = Number(process.env.RL_FRONTEND_PORT) || 5173
const BACKEND_PORT  = Number(process.env.RL_BACKEND_PORT)  || 8000

export default defineConfig({
  plugins: [react()],
  server: {
    port: FRONTEND_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
