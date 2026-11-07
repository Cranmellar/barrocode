import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The commit a build was made from, so a saved project or G-code says which
// barrocode made it. Dev server and tests read 'dev', which keeps the
// reference G-code from changing on every commit.
function buildInfo(command: string) {
  if (command !== 'build') return { commit: 'dev', date: '' }
  let commit = process.env.GITHUB_SHA?.slice(0, 7)
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
    } catch {
      commit = 'local'
    }
  }
  return { commit, date: new Date().toISOString().slice(0, 10) }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './',   // relative paths → works from file:// or any sub-path on USB
  define: {
    __BUILD__: JSON.stringify(buildInfo(command)),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
        },
      },
    },
  },
}))
