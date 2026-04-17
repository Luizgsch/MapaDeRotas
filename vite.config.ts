import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Base pública (ex.: `/nome-do-repo/` no GitHub Pages). Defina `BASE_PATH` no CI ou `npm run build -- --base=/foo/`. */
function normalizeBase(raw: string | undefined): string {
  if (!raw?.trim()) return '/'
  let b = raw.trim()
  if (!b.startsWith('/')) b = `/${b}`
  if (!b.endsWith('/')) b = `${b}/`
  return b
}

/** Tokens `sk.` não podem ir no bundle do browser (GitHub Push Protection bloqueia o deploy). */
function mapboxTokenForBundle(mode: string, cwd: string): string {
  const fileEnv = loadEnv(mode, cwd, '')
  const raw = (
    process.env.VITE_MAPBOX_ACCESS_TOKEN ??
    fileEnv.VITE_MAPBOX_ACCESS_TOKEN ??
    ''
  ).trim()
  if (raw.startsWith('sk.')) {
    console.warn(
      '\n[vite] VITE_MAPBOX_ACCESS_TOKEN começa com sk.: tokens secretos não vão para o cliente. Use um token público pk. no .env ou no secret do Actions.\n',
    )
    return ''
  }
  return raw
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const cwd = process.cwd()
  const base = normalizeBase(process.env.BASE_PATH)
  const mapboxToken = mapboxTokenForBundle(mode, cwd)

  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify(mapboxToken),
    },
  }
})
