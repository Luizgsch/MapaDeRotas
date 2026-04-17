import type { FeatureCollection } from 'geojson'

/**
 * Malha viária desenhada no mapa — vem do arquivo GeoJSON abaixo.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  COLE SEU GEOJSON AQUI: edite o arquivo `src/data/valeRoutes.json`      │
 * │  (export “FeatureCollection” do geojson.io ou do seu GIS).              │
 * │  Formato: { "type": "FeatureCollection", "features": [ ... ] }            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O clique no mapa que encontra “nó mais próximo” usa o grafo em
 * `map-config/routesData.ts` (PORT_ROUTES_*). Se você mudar só este JSON,
 * as linhas na tela mudam, mas o snap pode ficar desalinhado até alinhar
 * também os dados em `routesData.ts`.
 */
import valeRoutesJson from './valeRoutes.json'

export const valeRoutes: FeatureCollection = valeRoutesJson as FeatureCollection

/** Primeiro vértice da primeira LineString (malha exportada) — ancora da vista inicial. */
export function getValeRoutesFirstLngLat(): [longitude: number, latitude: number] {
  for (const f of valeRoutes.features) {
    if (f.geometry?.type !== 'LineString') continue
    const c = f.geometry.coordinates[0]
    if (c && c.length >= 2) return [c[0]!, c[1]!]
  }
  return [-44.3762, -2.5457]
}
