import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Base pública (ex.: `/nome-do-repo/` no GitHub Pages). Defina `BASE_PATH` no CI ou `npm run build -- --base=/foo/`. */
function normalizeBase(raw: string | undefined): string {
  if (!raw?.trim()) return '/'
  let b = raw.trim()
  if (!b.startsWith('/')) b = `/${b}`
  if (!b.endsWith('/')) b = `${b}/`
  return b
}

const base = normalizeBase(process.env.BASE_PATH)

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
