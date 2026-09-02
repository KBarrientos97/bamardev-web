import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fuerza una sola copia de React (evita "Invalid hook call" cuando una
  // dependencia arrastra su propia instancia).
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // El API de QA sólo habilita CORS para los dominios de CORS_ORIGINS del
    // VPS, y localhost no está entre ellos. En desarrollo pegamos a /api y
    // este proxy lo reenvía: el navegador ve un mismo origen y no hay
    // preflight que permitir. Los builds usan VITE_API_URL directo.
    proxy: {
      '/api': {
        target: 'https://api-qa.bamardev.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
