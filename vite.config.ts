import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // A dónde manda el proxy de desarrollo. Por defecto QA, que es lo que sirve
  // para el 90% del trabajo; con `API_PROXY=http://localhost:3000` en un
  // `.env.local` se prueba contra el backend de acá, que es lo único que sirve
  // cuando el cambio todavía no está desplegado.
  const env = loadEnv(mode, process.cwd(), '')
  const destino = env.API_PROXY || 'https://api-qa.bamardev.com'

  return {
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
          target: destino,
          changeOrigin: true,
          // Contra el backend local es http: exigir certificado válido ahí
          // haría fallar la conexión.
          secure: destino.startsWith('https'),
        },
      },
    },
  }
})
