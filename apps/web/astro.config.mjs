import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  // M2 : le compagnon en mode démo est entièrement client. Le rendu serveur et
  // l'adaptateur @astrojs/cloudflare arrivent à M5, avec les fiches film SEO.
  output: 'static',
  integrations: [svelte()],
  build: {
    // Un seul fichier CSS : les budgets JS de M5 se mesurent plus simplement.
    inlineStylesheets: 'auto',
  },
  vite: {
    worker: { format: 'es' },
    optimizeDeps: {
      // Transformers.js embarque des binaires wasm que Vite ne doit pas prébundler.
      exclude: ['@huggingface/transformers'],
    },
  },
})
