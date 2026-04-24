import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

import { cloudflare } from "@cloudflare/vite-plugin";

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
})()

export default defineConfig({
  base: '/',
  build: { target: 'es2022' },
  define: { __GIT_HASH__: JSON.stringify(gitHash) },
  optimizeDeps: { include: ['opensheetmusicdisplay'] },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'TrombonePractice',
      short_name: 'TrombonePractice',
      theme_color: '#1a1a2e',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 10_000_000,
      globPatterns: ['**/*.{js,css,html,ico,png,mp3}'],
    },
  }), cloudflare()],
})