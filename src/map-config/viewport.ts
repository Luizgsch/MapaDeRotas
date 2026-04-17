/** Vista inicial — Porto de Ponta da Madeira (MA). Mapbox usa [longitude, latitude]. */
export const PORT_VIEW = {
  longitude: -44.36,
  latitude: -2.56,
  zoom: 15,
  /** 0° = vista ortogonal (top-down); sem inclinação 3D. */
  pitch: 0,
  bearing: 0,
} as const

export const MAPBOX_STYLE_SATELLITE_STREETS =
  'mapbox://styles/mapbox/satellite-streets-v12' as const

/**
 * Defina `VITE_MAPBOX_ACCESS_TOKEN` no `.env` (token público pk.…).
 * Placeholder apenas para o projeto compilar; o mapa não carrega tiles sem token válido.
 */
export const MAPBOX_ACCESS_TOKEN =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ??
  'pk.PLACEHOLDER_SUBSTITUA_PELO_SEU_TOKEN_MAPBOX'

/** Sem token público válido (pk.… da sua conta Mapbox) os tiles não carregam. */
export function isLikelyInvalidMapboxToken(token: string): boolean {
  const t = token.trim()
  if (!t) return true
  if (t.includes('PLACEHOLDER')) return true
  if (!t.startsWith('pk.')) return true
  return false
}
