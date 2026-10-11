import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// `vite.config` exporta una FUNCIÓN desde que el proxy de desarrollo se elige
// por variable de entorno, y `mergeConfig` no sabe mezclar callbacks: hay que
// resolverla primero con el entorno que nos pasa vitest.
export default defineConfig(async (env) => {
  const base = await viteConfig(env)
  return mergeConfig(base, {
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  })
})
