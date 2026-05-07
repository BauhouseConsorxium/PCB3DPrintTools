import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

function copyDepsPlugin() {
  return {
    name: 'copy-deps',
    configResolved(config) {
      const dst = join(config.root, 'public')
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
      const earcutSrc = join(config.root, 'node_modules/earcut/dist/earcut.min.js')
      if (existsSync(earcutSrc)) copyFileSync(earcutSrc, join(dst, 'earcut.min.js'))
      const coiSrc = join(config.root, 'node_modules/coi-serviceworker/coi-serviceworker.min.js')
      if (existsSync(coiSrc)) copyFileSync(coiSrc, join(dst, 'coi-serviceworker.js'))
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/PCB3DPrintTools/' : '/',
  plugins: [copyDepsPlugin(), tailwindcss(), svelte()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
