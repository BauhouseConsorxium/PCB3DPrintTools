import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

function copyOcctPlugin() {
  return {
    name: 'copy-occt-wasm',
    configResolved(config) {
      const src = join(config.root, 'node_modules/occt-import-js/dist')
      const coiSrc = join(config.root, 'node_modules/coi-serviceworker')
      const dst = join(config.root, 'public')
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
      for (const f of ['occt-import-js.js', 'occt-import-js.wasm']) {
        if (existsSync(join(src, f))) copyFileSync(join(src, f), join(dst, f))
      }
      const coiFile = join(coiSrc, 'coi-serviceworker.min.js')
      if (existsSync(coiFile)) copyFileSync(coiFile, join(dst, 'coi-serviceworker.js'))
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/PCB3DPrintTools/' : '/',
  plugins: [copyOcctPlugin(), tailwindcss(), svelte()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
