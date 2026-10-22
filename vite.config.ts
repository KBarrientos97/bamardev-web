import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/** El commit de la copia local, para los builds que no corren en Actions. */
function commitLocal(): string {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch {
    return 'local'
  }
}

export default defineConfig(({ mode }) => {
  // A dónde manda el proxy de desarrollo. Por defecto QA, que es lo que sirve
  // para el 90% del trabajo; con `API_PROXY=http://localhost:3000` en un
  // `.env.local` se prueba contra el backend de acá, que es lo único que sirve
  // cuando el cambio todavía no está desplegado.
  const env = loadEnv(mode, process.cwd(), '')
  const destino = env.API_PROXY || 'https://api-qa.bamardev.com'
  // El asistente de la página (bamardev-chat) vive en el mismo dominio, en
  // `/chat`. Con `CHAT_PROXY=http://localhost:3100` se prueba el de acá.
  const destinoChat = env.CHAT_PROXY || destino

  // La versión de este build (ver src/lib/pwa/version.ts): la hora y el
  // commit. Va adentro del JS y en /version.json; si un equipo tiene otra, la
  // app sabe que quedó vieja aunque el service worker no se haya enterado.
  const commit = (process.env.GITHUB_SHA || commitLocal()).slice(0, 7)
  const version = `${new Date().toISOString().slice(0, 19)}Z+${commit}`

  return {
    define: {
      'import.meta.env.VITE_VERSION_APP': JSON.stringify(version),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'version-json',
        apply: 'build',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) })
        },
      },
      // La app instalable (PLAN-IOS §8). Sólo el service worker: el manifest
      // está en public/ y lo pone `lib/pwa/pwa.ts` únicamente en la app (el
      // mismo index sirve las páginas públicas, que no se instalan), y el
      // registro también es nuestro para no recargar a mitad de un cobro.
      //
      // Para DESHACERLO en los celulares que ya lo tienen no alcanza con
      // borrar esto: hay que publicar un deploy con `selfDestroying: true`,
      // que reemplaza el SW por uno que se desinstala y limpia lo guardado.
      VitePWA({
        injectRegister: false,
        manifest: false,
        registerType: 'autoUpdate',
        workbox: {
          // La app entera queda en el celular: abre sin bajarla aunque la red
          // esté lenta. Cada deploy baja sólo los pedazos que cambiaron.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Los íconos de instalar los baja el celular una vez; no van guardados.
          globIgnores: ['**/pwa-*', '**/apple-touch-icon*', '**/logo-marca.png', '**/push-sw.js'],
          // Las notificaciones push (FCM): el mismo SW las recibe y las
          // muestra; ver public/push-sw.js. Un solo SW para toda la app.
          // El pedazo grande de la app pasa los 2 MB del default de Workbox.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Las rutas de la app se abren con el index guardado; las públicas
          // (/p, /r) siguen yendo a Cloudflare, que les arma la vista previa
          // para WhatsApp. El API es otro dominio y el SW no lo toca: los
          // datos van SIEMPRE por internet, nunca de una copia vieja.
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/p\//, /^\/r\//, /^\/api\//, /^\/chat\//],
          importScripts: ['push-sw.js'],
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
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
        '/chat': {
          target: destinoChat,
          changeOrigin: true,
          secure: destinoChat.startsWith('https'),
        },
      },
    },
  }
})
