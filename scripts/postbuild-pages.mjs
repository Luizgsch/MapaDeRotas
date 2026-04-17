/**
 * GitHub Pages (SPA): copia index.html → 404.html para o servidor devolver a app em qualquer rota.
 */
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const indexHtml = join(dist, 'index.html')
const notFoundHtml = join(dist, '404.html')

if (!existsSync(indexHtml)) {
  console.error('postbuild-pages: dist/index.html não encontrado. Rode o build antes.')
  process.exit(1)
}

copyFileSync(indexHtml, notFoundHtml)
console.log('postbuild-pages: dist/404.html gerado (SPA).')
