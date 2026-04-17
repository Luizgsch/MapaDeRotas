import type { Feature, FeatureCollection, LineString, Position } from 'geojson'

/** Raio (m) para considerar dois vértices o mesmo nó (snap + fusão). */
export const ROUTE_VERTEX_MERGE_EPSILON_M = 16

export type RouteNode = {
  lng: number
  lat: number
  routeIds: string[]
}

type Pos = Position

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function distM(a: Pos, b: Pos): number {
  return haversineMeters(a[1]!, a[0]!, b[1]!, b[0]!)
}

function samePoint(a: Pos, b: Pos, epsM: number): boolean {
  return distM(a, b) <= epsM
}

/** Interseção de segmentos abertos no plano lng–lat (aprox. plano local). */
function segmentIntersection(
  a: Pos,
  b: Pos,
  c: Pos,
  d: Pos,
): Pos | null {
  const x1 = a[0]!
  const y1 = a[1]!
  const x2 = b[0]!
  const y2 = b[1]!
  const x3 = c[0]!
  const y3 = c[1]!
  const x4 = d[0]!
  const y4 = d[1]!

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-12) return null

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den

  const eps = 1e-9
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null

  const lng = x1 + t * (x2 - x1)
  const lat = y1 + t * (y2 - y1)
  return [lng, lat]
}

/** Insere vértices em todos os cruzamentos entre vias (exceto pontas compartilhadas). */
function insertLineIntersections(lines: Pos[][]): Pos[][] {
  const out = lines.map((ring) => [...ring])

  for (let round = 0; round < 30; round++) {
    let changed = false
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i]!
        const B = out[j]!
        for (let ia = 0; ia < A.length - 1; ia++) {
          for (let jb = 0; jb < B.length - 1; jb++) {
            const hit = segmentIntersection(A[ia]!, A[ia + 1]!, B[jb]!, B[jb + 1]!)
            if (!hit) continue
            if (
              samePoint(hit, A[ia]!, 0.6) ||
              samePoint(hit, A[ia + 1]!, 0.6) ||
              samePoint(hit, B[jb]!, 0.6) ||
              samePoint(hit, B[jb + 1]!, 0.6)
            ) {
              continue
            }

            out[i] = [...A.slice(0, ia + 1), hit, ...A.slice(ia + 1)]
            out[j] = [...B.slice(0, jb + 1), hit, ...B.slice(jb + 1)]
            changed = true
            break outer
          }
        }
      }
    }
    if (!changed) break
  }

  return out
}

class UnionFind {
  private readonly p: number[]
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    if (this.p[i] !== i) this.p[i] = this.find(this.p[i]!)
    return this.p[i]!
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.p[rb] = ra
  }
}

function snapVerticesUnionFind(
  lines: Pos[][],
  epsM: number,
): Pos[][] {
  const flat: Pos[] = []
  const owner: { line: number; idx: number }[] = []
  for (let li = 0; li < lines.length; li++) {
    for (let k = 0; k < lines[li]!.length; k++) {
      flat.push(lines[li]![k]!)
      owner.push({ line: li, idx: k })
    }
  }
  const n = flat.length
  if (n === 0) return lines

  const uf = new UnionFind(n)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (distM(flat[a]!, flat[b]!) <= epsM) uf.union(a, b)
    }
  }

  const centroids = new Map<number, { sx: number; sy: number; c: number }>()
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    const p = flat[i]!
    const cur = centroids.get(r) ?? { sx: 0, sy: 0, c: 0 }
    cur.sx += p[0]!
    cur.sy += p[1]!
    cur.c += 1
    centroids.set(r, cur)
  }

  const snapped: Pos[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    const { sx, sy, c } = centroids.get(r)!
    snapped[i] = [sx / c, sy / c]
  }

  const result: Pos[][] = lines.map((ln) => ln.map(() => [0, 0] as Pos))
  for (let i = 0; i < n; i++) {
    const { line, idx } = owner[i]!
    result[line]![idx] = snapped[i]!
  }

  return result.map((ln) => dedupeConsecutive(ln))
}

function dedupeConsecutive(ring: Pos[]): Pos[] {
  const out: Pos[] = []
  for (const p of ring) {
    const last = out[out.length - 1]
    if (last && distM(last, p) < 0.35) continue
    out.push(p)
  }
  return out
}

function reverseLine(ring: Pos[]): Pos[] {
  return [...ring].reverse()
}

/** Une cadeias que compartilham extremo (após snap). */
function mergeEndpointChains(
  lines: Pos[][],
  props: { id: string; name: string }[],
  epsM: number,
): { lines: Pos[][]; props: { id: string; name: string }[] } {
  const L = lines.map((l) => [...l])
  const P = props.map((p) => ({ ...p }))

  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < L.length; i++) {
      if (L[i]!.length === 0) continue
      for (let j = 0; j < L.length; j++) {
        if (i === j || L[j]!.length === 0) continue
        const a = L[i]!
        const b = L[j]!
        const a0 = a[0]!
        const a1 = a[a.length - 1]!
        const b0 = b[0]!
        const b1 = b[b.length - 1]!

        const concat = (head: Pos[], tail: Pos[]): Pos[] => {
          if (tail.length === 0) return [...head]
          if (head.length === 0) return [...tail]
          if (samePoint(head[head.length - 1]!, tail[0]!, epsM)) {
            return [...head, ...tail.slice(1)]
          }
          return [...head, ...tail]
        }

        if (samePoint(a1, b0, epsM)) {
          L[i] = concat(a, b.slice(1))
          L[j] = []
          P[i] = {
            id: `${P[i]!.id}+${P[j]!.id}`,
            name: `${P[i]!.name} + ${P[j]!.name}`,
          }
          changed = true
          break outer
        }
        if (samePoint(a1, b1, epsM)) {
          L[i] = concat(a, reverseLine(b).slice(1))
          L[j] = []
          P[i] = {
            id: `${P[i]!.id}+${P[j]!.id}`,
            name: `${P[i]!.name} + ${P[j]!.name}`,
          }
          changed = true
          break outer
        }
        if (samePoint(a0, b0, epsM)) {
          L[i] = concat(reverseLine(a).slice(1), b)
          L[j] = []
          P[i] = {
            id: `${P[i]!.id}+${P[j]!.id}`,
            name: `${P[i]!.name} + ${P[j]!.name}`,
          }
          changed = true
          break outer
        }
        if (samePoint(a0, b1, epsM)) {
          L[i] = concat(reverseLine(b), a.slice(1))
          L[j] = []
          P[i] = {
            id: `${P[i]!.id}+${P[j]!.id}`,
            name: `${P[i]!.name} + ${P[j]!.name}`,
          }
          changed = true
          break outer
        }
      }
    }
  }

  const keptLines: Pos[][] = []
  const keptProps: { id: string; name: string }[] = []
  for (let k = 0; k < L.length; k++) {
    if (L[k]!.length >= 2) {
      keptLines.push(L[k]!)
      keptProps.push(P[k]!)
    }
  }
  return { lines: keptLines, props: keptProps }
}

function lineStringsToFeatures(
  lines: Pos[][],
  props: { id: string; name: string }[],
): Feature[] {
  return lines.map((coordinates, idx) => ({
    type: 'Feature' as const,
    properties: props[idx]!,
    geometry: {
      type: 'LineString' as const,
      coordinates,
    } satisfies LineString,
  }))
}

/**
 * Fragmentos desenhados separadamente (termina um trecho, começa outro quase colado
 * ou cruzando). Passo único: interseções → snap por proximidade → fusão por extremos.
 */
export function buildMergedPortRoutes(
  raw: FeatureCollection,
  epsilonMeters: number = ROUTE_VERTEX_MERGE_EPSILON_M,
): FeatureCollection {
  const lines: Pos[][] = []
  const props: { id: string; name: string }[] = []

  for (const f of raw.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const id =
      f.properties &&
      typeof f.properties === 'object' &&
      'id' in f.properties &&
      typeof (f.properties as { id?: unknown }).id === 'string'
        ? (f.properties as { id: string }).id
        : `frag-${lines.length}`
    const name =
      f.properties &&
      typeof f.properties === 'object' &&
      'name' in f.properties &&
      typeof (f.properties as { name?: unknown }).name === 'string'
        ? (f.properties as { name: string }).name
        : id
    lines.push(f.geometry.coordinates.map((c) => [c[0]!, c[1]!]))
    props.push({ id, name })
  }

  const withCross = insertLineIntersections(lines)
  const snapped = snapVerticesUnionFind(withCross, epsilonMeters)
  const merged = mergeEndpointChains(snapped, props, epsilonMeters)

  return {
    type: 'FeatureCollection',
    features: lineStringsToFeatures(merged.lines, merged.props),
  }
}

/* --- Nós nominais (podem divergir levemente nos fragmentos; o merge alinha) --- */
const N_PIER4 = [-44.3762, -2.5457] as const
const N_ALONG_A = [-44.3754, -2.5461] as const
const N_JUNCTION_MAIN = [-44.3744, -2.5468] as const
const N_LOADER = [-44.3736, -2.5474] as const
const N_TERMINAL = [-44.3728, -2.5482] as const
const N_YARD_APPROACH = [-44.372, -2.549] as const
const N_YARD_MAIN = [-44.3714, -2.5497] as const
const N_QUAY_A = [-44.374, -2.5459] as const
const N_QUAY_B = [-44.3735, -2.5454] as const

/**
 * Fragmentos RAW: trechos que “quase” se tocam ou se cruzam (simula desenho em partes).
 * O pipeline gera `PORT_ROUTES_GEOJSON` contínuo onde possível.
 */
export const PORT_ROUTES_RAW_FRAGMENTS: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'frag-pier4-a', name: 'Pier 4 (trecho A)' },
      geometry: {
        type: 'LineString',
        coordinates: [[...N_PIER4], [...N_ALONG_A]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-pier4-b', name: 'Pier 4 (trecho B — quase junção)' },
      geometry: {
        type: 'LineString',
        coordinates: [
          // ~8 m de N_ALONG_A — mesmo cluster que o fim do trecho A após snap
          [-44.37542, -2.54611],
          [...N_JUNCTION_MAIN],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-eixo-terminal', name: 'Eixo terminal (parte 1)' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [...N_JUNCTION_MAIN],
          [...N_LOADER],
          [...N_TERMINAL],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-patio', name: 'Aproximação pátio' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [...N_TERMINAL],
          // quase colado ao trecho seguinte (~4 m)
          [-44.37205, -2.54895],
          [...N_YARD_APPROACH],
          [...N_YARD_MAIN],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-quay-1', name: 'Cais carregador (parte 1)' },
      geometry: {
        type: 'LineString',
        coordinates: [[...N_JUNCTION_MAIN], [...N_QUAY_A]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-quay-2', name: 'Cais carregador (parte 2)' },
      geometry: {
        type: 'LineString',
        coordinates: [
          // extremo ~6 m de N_QUAY_A — snap une ao grafo
          [-44.37392, -2.54582],
          [...N_QUAY_B],
          [...N_LOADER],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'frag-lateral', name: 'Lateral terminal–pátio' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [...N_TERMINAL],
          [-44.3722, -2.5488],
          [-44.3718, -2.5492],
          [...N_YARD_MAIN],
        ],
      },
    },
  ],
}

export const PORT_ROUTES_GEOJSON = buildMergedPortRoutes(
  PORT_ROUTES_RAW_FRAGMENTS,
  ROUTE_VERTEX_MERGE_EPSILON_M,
)

function buildRouteNodeIndex(fc: FeatureCollection): RouteNode[] {
  const map = new Map<string, { lng: number; lat: number; routeIds: Set<string> }>()

  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const id =
      f.properties &&
      typeof f.properties === 'object' &&
      'id' in f.properties &&
      typeof (f.properties as { id?: unknown }).id === 'string'
        ? (f.properties as { id: string }).id
        : 'unknown'

    for (const c of f.geometry.coordinates) {
      const lng = c[0]!
      const lat = c[1]!
      const key = `${lng},${lat}`
      const cur = map.get(key) ?? { lng, lat, routeIds: new Set<string>() }
      cur.routeIds.add(id)
      map.set(key, cur)
    }
  }

  return [...map.values()].map((v) => ({
    lng: v.lng,
    lat: v.lat,
    routeIds: [...v.routeIds],
  }))
}

const NODE_INDEX = buildRouteNodeIndex(PORT_ROUTES_GEOJSON)

export function getPortRouteNodes(): readonly RouteNode[] {
  return NODE_INDEX
}

export function findNearestRouteNode(
  lng: number,
  lat: number,
  maxDistanceMeters: number,
): (RouteNode & { distanceM: number }) | null {
  let best: (RouteNode & { distanceM: number }) | null = null
  for (const n of NODE_INDEX) {
    const d = haversineMeters(lat, lng, n.lat, n.lng)
    if (d <= maxDistanceMeters && (!best || d < best.distanceM)) {
      best = { ...n, distanceM: d }
    }
  }
  return best
}
