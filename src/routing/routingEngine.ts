import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Position,
} from 'geojson'
import nearestPoint from '@turf/nearest-point'
import { featureCollection, point } from '@turf/helpers'

const INF = Number.POSITIVE_INFINITY
const NODE_PRECISION = 7

/**
 * Vértices de LineStrings diferentes a até esta distância viram o mesmo nó (malha contínua).
 * Valores maiores ligam melhor vias que quase se tocam no desenho (evita “pontes” falsas
 * onde um bloqueio no meio corta todo o contorno no grafo).
 */
export const VERTEX_WELD_THRESHOLD_M = 6

/**
 * Após montar as arestas do GeoJSON, liga pares de nós sem aresta cuja distância geodésica
 * está neste intervalo (metros). Cobre lacunas entre feições (T, paralelas quase juntas)
 * que a soldagem sozinha não fecha.
 */
export const GRAPH_NEAR_NODE_STITCH_M = 7

export type RoutePlanStatus = 'OPTIMAL' | 'IMPOSSIBLE'

export type CalculatePathOutcome = {
  path: LngLat[]
  pathNodeIds: string[]
  status: RoutePlanStatus
  /** Soma dos pesos usados pelo Dijkstra (inclui penalidade em bloqueios). */
  weightedCostM: number
  /** Comprimento geodésico real ao longo da polilinha (metros). */
  geometricDistanceM: number
  message: string
}

export type PathResult = {
  pathNodeIds: string[]
  coordinates: LngLat[]
  distanceM: number
  /** Arestas na ordem origem → destino (comprimento = len(coordinates) − 1). */
  pathEdgeIds: string[]
}

export type LngLat = [number, number]

export type RoadEdge = {
  id: string
  a: string
  b: string
  weightM: number
  /** Extremos do segmento (mesma ordem do GeoJSON). */
  from: LngLat
  to: LngLat
}

export type RoadGraph = {
  /** Lista de adjacência: nó → arestas incidentes (grafo não direcionado, duas entradas por aresta). */
  adjacency: Map<string, { to: string; edgeId: string; weightM: number }[]>
  nodeCoord: Map<string, LngLat>
  edgesById: Map<string, RoadEdge>
  edgeList: RoadEdge[]
}

export function nodeKey(lng: number, lat: number): string {
  return `${lng.toFixed(NODE_PRECISION)},${lat.toFixed(NODE_PRECISION)}`
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lng2 - lng1) * Math.PI) / 180
  const x =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function addUndirectedEdge(
  adj: RoadGraph['adjacency'],
  a: string,
  b: string,
  edgeId: string,
  w: number,
): void {
  if (a === b || w <= 0 || !Number.isFinite(w)) return
  const la = adj.get(a) ?? []
  la.push({ to: b, edgeId, weightM: w })
  adj.set(a, la)
  const lb = adj.get(b) ?? []
  lb.push({ to: a, edgeId, weightM: w })
  adj.set(b, lb)
}

function hasUndirectedEdge(
  adj: RoadGraph['adjacency'],
  a: string,
  b: string,
): boolean {
  for (const e of adj.get(a) ?? []) {
    if (e.to === b) return true
  }
  return false
}

/**
 * Arestas sintéticas entre nós já existentes muito próximos mas sem segmento GeoJSON
 * explícito — reduz falsos “destino inacessível” quando o contorno existe no terreno
 * mas não encosta o suficiente para soldar.
 */
function stitchNearlyCoincidentNodes(
  adjacency: RoadGraph['adjacency'],
  nodeCoord: Map<string, LngLat>,
  edgesById: Map<string, RoadEdge>,
  edgeList: RoadEdge[],
  maxGapM: number,
): void {
  const ids = [...nodeCoord.keys()]
  if (ids.length > 4000) {
    console.warn(
      `[Vale routing] ${ids.length} nós: costura por proximidade omitida (limite O(V²)).`,
    )
    return
  }
  let stitchIx = 0
  for (let i = 0; i < ids.length; i++) {
    const idA = ids[i]!
    const ca = nodeCoord.get(idA)!
    for (let j = i + 1; j < ids.length; j++) {
      const idB = ids[j]!
      if (hasUndirectedEdge(adjacency, idA, idB)) continue
      const cb = nodeCoord.get(idB)!
      const w = haversineMeters(ca, cb)
      if (w < 0.05 || w > maxGapM) continue
      const edgeId = `__stitch__${stitchIx++}`
      const edge: RoadEdge = {
        id: edgeId,
        a: idA,
        b: idB,
        weightM: w,
        from: ca,
        to: cb,
      }
      edgesById.set(edgeId, edge)
      edgeList.push(edge)
      addUndirectedEdge(adjacency, idA, idB, edgeId, w)
    }
  }
  if (stitchIx > 0) {
    console.log(
      `[Vale routing] Costura entre nós próximos (≤${maxGapM} m, sem aresta): +${stitchIx} ligações.`,
    )
  }
}

/**
 * Soldagem de vértices: se já existe nó a ≤ `thresholdM`, reutiliza o ID e a coordenada canônica;
 * senão cria nó novo (chave por precisão fixa).
 */
export function resolveWeldedVertexId(
  lng: number,
  lat: number,
  nodeCoord: Map<string, LngLat>,
  thresholdM: number = VERTEX_WELD_THRESHOLD_M,
): string {
  const p: LngLat = [lng, lat]
  let bestId: string | null = null
  let bestDist = thresholdM + 1
  for (const [id, c] of nodeCoord) {
    const d = haversineMeters(p, c)
    if (d <= thresholdM && d < bestDist) {
      bestDist = d
      bestId = id
    }
  }
  if (bestId !== null) return bestId

  const id = nodeKey(lng, lat)
  if (!nodeCoord.has(id)) {
    nodeCoord.set(id, p)
    return id
  }
  const existing = nodeCoord.get(id)!
  if (haversineMeters(p, existing) <= thresholdM) return id

  let n = 1
  let alt = `${id}#w${n}`
  while (nodeCoord.has(alt)) {
    n += 1
    alt = `${id}#w${n}`
  }
  nodeCoord.set(alt, p)
  return alt
}

/**
 * Constrói um único grafo global a partir de todas as LineStrings: vértices geograficamente próximos
 * (≤ {@link VERTEX_WELD_THRESHOLD_M} m) compartilham o mesmo ID de nó.
 */
export function buildRoadGraph(fc: FeatureCollection): RoadGraph {
  const adjacency: RoadGraph['adjacency'] = new Map()
  const nodeCoord: RoadGraph['nodeCoord'] = new Map()
  const edgesById = new Map<string, RoadEdge>()
  const edgeList: RoadEdge[] = []

  let featureIndex = 0
  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const coords = (f.geometry as LineString).coordinates
    const baseId =
      f.properties &&
      typeof f.properties === 'object' &&
      'id' in f.properties &&
      typeof (f.properties as { id?: unknown }).id === 'string'
        ? (f.properties as { id: string }).id
        : `f${featureIndex}`

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i]!
      const p1 = coords[i + 1]!
      const rawFrom: LngLat = [p0[0]!, p0[1]!]
      const rawTo: LngLat = [p1[0]!, p1[1]!]

      const a = resolveWeldedVertexId(rawFrom[0], rawFrom[1], nodeCoord)
      const b = resolveWeldedVertexId(rawTo[0], rawTo[1], nodeCoord)
      const from = nodeCoord.get(a)!
      const to = nodeCoord.get(b)!
      const w = haversineMeters(from, to)
      if (w < 0.05) continue

      const edgeId = `${baseId}#seg${i}`
      const edge: RoadEdge = { id: edgeId, a, b, weightM: w, from, to }
      edgesById.set(edgeId, edge)
      edgeList.push(edge)
      addUndirectedEdge(adjacency, a, b, edgeId, w)
    }
    featureIndex++
  }

  stitchNearlyCoincidentNodes(
    adjacency,
    nodeCoord,
    edgesById,
    edgeList,
    GRAPH_NEAR_NODE_STITCH_M,
  )

  console.log(
    `[Vale routing] Grafo unificado: ${nodeCoord.size} nós totais após soldagem (≤${VERTEX_WELD_THRESHOLD_M} m).`,
  )

  const graph = { adjacency, nodeCoord, edgesById, edgeList }
  logMeshRoutingHints(graph)
  return graph
}

/** Diagnóstico: componentes desconexas e ausência de ciclos (sem “volta” alternativa). */
function logMeshRoutingHints(graph: RoadGraph): void {
  const { nodeCoord, adjacency, edgeList } = graph
  const nodeComp = new Map<string, number>()
  let compIdx = 0
  for (const start of nodeCoord.keys()) {
    if (nodeComp.has(start)) continue
    const q = [start]
    nodeComp.set(start, compIdx)
    while (q.length > 0) {
      const u = q.shift()!
      for (const e of adjacency.get(u) ?? []) {
        if (!nodeComp.has(e.to)) {
          nodeComp.set(e.to, compIdx)
          q.push(e.to)
        }
      }
    }
    compIdx += 1
  }

  const vCount = new Map<number, number>()
  for (const id of nodeComp.values()) {
    vCount.set(id, (vCount.get(id) ?? 0) + 1)
  }
  const eCount = new Map<number, number>()
  for (const ed of edgeList) {
    const ca = nodeComp.get(ed.a)
    const cb = nodeComp.get(ed.b)
    if (ca !== undefined && ca === cb) {
      eCount.set(ca, (eCount.get(ca) ?? 0) + 1)
    }
  }

  let largestComp = -1
  let largestV = 0
  for (const [cid, v] of vCount) {
    if (v > largestV) {
      largestV = v
      largestComp = cid
    }
  }

  if (vCount.size > 1) {
    console.warn(
      `[Vale routing] Malha em ${vCount.size} componentes desconexas; o roteador não liga “ilhas” separadas. Una extremidades de vias no GeoJSON (soldagem ≤${VERTEX_WELD_THRESHOLD_M} m ou novos segmentos).`,
    )
  }

  if (largestComp >= 0 && largestV > 2) {
    const E = eCount.get(largestComp) ?? 0
    const hasCycle = E > largestV - 1
    if (!hasCycle) {
      console.warn(
        `[Vale routing] Maior componente (${largestV} nós, ${E} arestas) é acíclico — não há circuito para “super volta”. Adicione LineStrings que conectem nós já existentes e fechem ciclos.`,
      )
    } else {
      console.log(
        `[Vale routing] Maior componente: ${largestV} nós, ${E} arestas (há ciclos — alternativas de rota possíveis).`,
      )
    }
  }
}

/**
 * Todos os vértices da malha como pontos GeoJSON (IDs iguais aos nós do grafo).
 * Use com {@link findNearestNode} e `nearestPoint` do Turf.
 */
export function buildValeMeshNodesFeatureCollection(
  graph: RoadGraph,
): FeatureCollection<Point> {
  const features: Feature<Point>[] = []
  for (const [id, c] of graph.nodeCoord) {
    features.push(point(c, { nodeId: id }))
  }
  return featureCollection(features)
}

/** Pontos para camada `circle` — debug de conectividade (um círculo por nó após soldagem). */
export function buildGraphNodesDebugFeatureCollection(
  graph: RoadGraph,
): FeatureCollection<Point> {
  const features: Feature<Point>[] = []
  for (const [, c] of graph.nodeCoord) {
    features.push(point(c, { kind: 'graph-node-debug' }))
  }
  return featureCollection(features)
}

/**
 * Snap to node: nó mais próximo ao clique na malha (Turf `nearestPoint`, geodésico).
 */
export function findNearestNode(
  clickCoords: LngLat,
  nodesFc: FeatureCollection<Point>,
  maxDistanceM: number,
): { id: string; lng: number; lat: number; distanceM: number } | null {
  if (nodesFc.features.length === 0) return null
  const tgt = point(clickCoords)
  const nearest = nearestPoint(tgt, nodesFc, { units: 'meters' })
  const distM = nearest.properties.distanceToPoint
  if (distM > maxDistanceM) return null
  const nodeId = nearest.properties.nodeId
  if (typeof nodeId !== 'string') return null
  const [lng, lat] = nearest.geometry.coordinates
  return { id: nodeId, lng, lat, distanceM: distM }
}

/** Chave canônica do par de nós (aresta não direcionada). */
function undirectedNodePairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

/** Prefixo da feição no `edgeId` (`buildRoadGraph`: `${baseId}#seg${i}`). */
function edgeFeatureBaseId(edgeId: string): string {
  const k = edgeId.lastIndexOf('#seg')
  if (k === -1) return edgeId
  return edgeId.slice(0, k)
}

/**
 * Expande bloqueio a outras arestas **da mesma feição** com o mesmo par de nós
 * (duplicata na mesma LineString). Não expande para outras feições: após soldagem,
 * vias distintas podem compartilhar nós num cruzamento; bloquear só o atalho não deve
 * remover arestas paralelas de outro `feature`, senão o grafo pode ficar desconexo e
 * aparecer “inacessível” mesmo existindo contorno longo.
 */
export function expandBlockedEdgeIds(
  graph: RoadGraph,
  blockedEdgeIds: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  const pairsPerBase = new Map<string, Set<string>>()

  for (const id of blockedEdgeIds) {
    const e = graph.edgesById.get(id)
    if (!e) continue
    out.add(id)
    const base = edgeFeatureBaseId(id)
    const pk = undirectedNodePairKey(e.a, e.b)
    let s = pairsPerBase.get(base)
    if (!s) {
      s = new Set()
      pairsPerBase.set(base, s)
    }
    s.add(pk)
  }

  for (const ed of graph.edgeList) {
    const base = edgeFeatureBaseId(ed.id)
    const pairs = pairsPerBase.get(base)
    if (!pairs) continue
    if (pairs.has(undirectedNodePairKey(ed.a, ed.b))) {
      out.add(ed.id)
    }
  }

  return out
}

/** BFS: existe caminho sem atravessar arestas bloqueadas? */
export function isReachableWithoutBlockedEdges(
  graph: RoadGraph,
  startId: string,
  goalId: string,
  blockedEdgeIds: ReadonlySet<string>,
): boolean {
  if (startId === goalId) return true
  const { adjacency } = graph
  const q: string[] = [startId]
  const seen = new Set<string>([startId])
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi]!
    for (const e of adjacency.get(u) ?? []) {
      if (blockedEdgeIds.has(e.edgeId)) continue
      if (e.to === goalId) return true
      if (!seen.has(e.to)) {
        seen.add(e.to)
        q.push(e.to)
      }
    }
  }
  return false
}

const MSG_IMPOSSIBLE =
  'ALERTA: Destino inacessível devido a bloqueios operacionais'

/**
 * Menor caminho no grafo **sem** atravessar trechos bloqueados (arestas removidas).
 * Bloqueios expandem-se só na mesma feição GeoJSON (mesmo par de nós, mesmo `feature`).
 * `modoSupervisor` mantém a API e força recálculo na UI ao alternar o modo.
 */
export function calculatePath(
  graph: RoadGraph,
  startId: string,
  goalId: string,
  listaBloqueios: ReadonlySet<string>,
  modoSupervisor: boolean,
): CalculatePathOutcome {
  void modoSupervisor
  const fail = (): CalculatePathOutcome => ({
    path: [],
    pathNodeIds: [],
    status: 'IMPOSSIBLE',
    weightedCostM: Number.POSITIVE_INFINITY,
    geometricDistanceM: 0,
    message: MSG_IMPOSSIBLE,
  })

  if (!graph.nodeCoord.has(startId) || !graph.nodeCoord.has(goalId)) {
    return fail()
  }

  const blockedExpanded = expandBlockedEdgeIds(graph, listaBloqueios)

  const dijk = dijkstraShortestPath(
    graph,
    startId,
    goalId,
    blockedExpanded,
    new Set(),
    undefined,
  )

  if (!dijk) {
    return fail()
  }

  const geometricDistanceM = polylineLengthMeters(dijk.coordinates)

  return {
    path: dijk.coordinates,
    pathNodeIds: dijk.pathNodeIds,
    status: 'OPTIMAL',
    weightedCostM: dijk.distanceM,
    geometricDistanceM,
    message: '',
  }
}

export const routingEngine = {
  calculatePath,
  findNearestNode,
  buildRoadGraph,
  buildValeMeshNodesFeatureCollection,
  buildGraphNodesDebugFeatureCollection,
  dijkstraShortestPath,
  isReachableWithoutBlockedEdges,
  expandBlockedEdgeIds,
} as const

function distPointToSegmentMeters(
  p: LngLat,
  a: LngLat,
  b: LngLat,
): { distM: number; t: number } {
  const ax = a[0]
  const ay = a[1]
  const bx = b[0]
  const by = b[1]
  const px = p[0]
  const py = p[1]
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * abx
  const qy = ay + t * aby
  return { distM: haversineMeters(p, [qx, qy]), t }
}

export function findNearestGraphNode(
  graph: RoadGraph,
  lng: number,
  lat: number,
  maxDistanceM: number,
): { id: string; lng: number; lat: number; distanceM: number } | null {
  const p: LngLat = [lng, lat]
  let best: { id: string; lng: number; lat: number; distanceM: number } | null =
    null
  for (const [id, c] of graph.nodeCoord) {
    const d = haversineMeters(p, c)
    if (d <= maxDistanceM && (!best || d < best.distanceM)) {
      best = { id, lng: c[0], lat: c[1], distanceM: d }
    }
  }
  return best
}

export function findNearestGraphEdge(
  graph: RoadGraph,
  lng: number,
  lat: number,
  maxDistanceM: number,
): { edgeId: string; distanceM: number } | null {
  const p: LngLat = [lng, lat]
  let best: { edgeId: string; distanceM: number } | null = null
  for (const e of graph.edgeList) {
    const { distM } = distPointToSegmentMeters(p, e.from, e.to)
    if (distM <= maxDistanceM && (!best || distM < best.distanceM)) {
      best = { edgeId: e.id, distanceM: distM }
    }
  }
  return best
}

/** Min-heap binário para Dijkstra (lazy decrease-key: entradas obsoletas são ignoradas). */
class DistHeap {
  private readonly h: { d: number; id: string }[] = []

  get length(): number {
    return this.h.length
  }

  push(x: { d: number; id: string }): void {
    this.h.push(x)
    this.siftUp(this.h.length - 1)
  }

  pop(): { d: number; id: string } | undefined {
    const ar = this.h
    const n = ar.length
    if (n === 0) return undefined
    const top = ar[0]!
    const last = ar.pop()!
    if (n > 1) {
      ar[0] = last
      this.siftDown(0)
    }
    return top
  }

  private siftUp(i: number): void {
    const ar = this.h
    while (i > 0) {
      const p = (i - 1) >> 1
      if (ar[i]!.d >= ar[p]!.d) break
      ;[ar[i], ar[p]] = [ar[p]!, ar[i]!]
      i = p
    }
  }

  private siftDown(i: number): void {
    const ar = this.h
    const n = ar.length
    for (;;) {
      const l = i * 2 + 1
      if (l >= n) break
      let m = l
      const r = l + 1
      if (r < n && ar[r]!.d < ar[l]!.d) m = r
      if (ar[m]!.d >= ar[i]!.d) break
      ;[ar[i], ar[m]] = [ar[m]!, ar[i]!]
      i = m
    }
  }
}

/**
 * Dijkstra (pesos não negativos) com fila de prioridade — escala para malhas grandes.
 * Arestas em `blockedNodeIds` podem ser excluídas.
 * Arestas em `blockedEdgeIds`: por omissão são ignoradas; com `blockedEdgePenaltyM` ou
 * `blockedEdgePenaltyMultiplier` recebem peso penalizado em vez de infinito.
 */
export function dijkstraShortestPath(
  graph: RoadGraph,
  startId: string,
  goalId: string,
  blockedEdgeIds: ReadonlySet<string>,
  blockedNodeIds: ReadonlySet<string>,
  options?: {
    blockedEdgePenaltyM?: number
    blockedEdgePenaltyMultiplier?: number
  },
): PathResult | null {
  if (startId === goalId) {
    const c = graph.nodeCoord.get(startId)
    if (!c) return null
    return {
      pathNodeIds: [startId],
      coordinates: [c],
      distanceM: 0,
      pathEdgeIds: [],
    }
  }

  const { adjacency, nodeCoord } = graph
  const dist = new Map<string, number>()
  const prev = new Map<string, { node: string; edgeId: string } | null>()

  for (const id of nodeCoord.keys()) {
    dist.set(id, INF)
    prev.set(id, null)
  }
  if (!dist.has(startId) || !dist.has(goalId)) return null

  dist.set(startId, 0)

  const relaxable = (u: string, v: string): boolean => {
    if (blockedNodeIds.has(v) && v !== goalId) return false
    if (blockedNodeIds.has(u) && u !== startId) return false
    return true
  }

  const heap = new DistHeap()
  heap.push({ d: 0, id: startId })

  let finalD = INF

  while (heap.length > 0) {
    const item = heap.pop()!
    const u = item.id
    const du = item.d
    // tolerância numérica: evita descartar extração válida após muitas somas em caminho longo
    const bestKnown = dist.get(u) ?? INF
    if (du > bestKnown + 1e-6) continue
    if (u === goalId) {
      finalD = du
      break
    }

    for (const e of adjacency.get(u) ?? []) {
      if (!relaxable(u, e.to)) continue
      let w = e.weightM
      if (blockedEdgeIds.has(e.edgeId)) {
        if (options?.blockedEdgePenaltyMultiplier != null) {
          w = e.weightM * options.blockedEdgePenaltyMultiplier
        } else if (options?.blockedEdgePenaltyM != null) {
          w = options.blockedEdgePenaltyM
        } else {
          continue
        }
      }
      const nd = du + w
      const old = dist.get(e.to) ?? INF
      if (nd + 1e-9 < old) {
        dist.set(e.to, nd)
        prev.set(e.to, { node: u, edgeId: e.edgeId })
        heap.push({ d: nd, id: e.to })
      }
    }
  }

  if (!Number.isFinite(finalD)) {
    const dGoal = dist.get(goalId) ?? INF
    if (!Number.isFinite(dGoal)) return null
    finalD = dGoal
  }

  const pathNodeIds: string[] = []
  const pathEdgeIdsOrdered: string[] = []
  let cur: string | null = goalId
  const seenBack = new Set<string>()
  while (cur !== null) {
    if (seenBack.has(cur)) return null
    seenBack.add(cur)
    pathNodeIds.push(cur)
    const p = prev.get(cur)
    if (p?.edgeId) pathEdgeIdsOrdered.unshift(p.edgeId)
    cur = p?.node ?? null
    if (pathNodeIds.length > nodeCoord.size + 2) return null
  }
  pathNodeIds.reverse()
  if (pathNodeIds.length === 0 || pathNodeIds[0] !== startId) return null

  const coordinates = pathNodeIds.map((id) => nodeCoord.get(id)!).filter(Boolean)
  return {
    pathNodeIds,
    coordinates,
    distanceM: finalD,
    pathEdgeIds: pathEdgeIdsOrdered,
  }
}

export function lineStringFeatureCollection(
  coordinates: LngLat[],
): FeatureCollection {
  if (coordinates.length < 2) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'active-route' },
        geometry: {
          type: 'LineString',
          coordinates: coordinates as Position[],
        },
      },
    ],
  }
}

/** GeoJSON para vias bloqueadas: só o segmento (linha vermelha no mapa). */
export function buildBlockedVisualization(
  graph: RoadGraph,
  blockedEdgeIds: ReadonlySet<string>,
): FeatureCollection {
  const features: FeatureCollection['features'] = []

  for (const id of blockedEdgeIds) {
    const e = graph.edgesById.get(id)
    if (!e) continue
    features.push({
      type: 'Feature',
      properties: { kind: 'blocked-segment' },
      geometry: {
        type: 'LineString',
        coordinates: [e.from, e.to] as Position[],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

export function polylineLengthMeters(pts: LngLat[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    s += haversineMeters(pts[i - 1]!, pts[i]!)
  }
  return s
}

/** Reamostragem uniforme por comprimento ao longo da polilinha (≥2 pontos). */
export function resamplePolyline(pts: LngLat[], targetCount: number): LngLat[] {
  if (pts.length === 0) return []
  if (pts.length === 1 || targetCount <= 1) return [pts[0]!]
  const total = polylineLengthMeters(pts)
  if (total < 1e-6) return Array.from({ length: targetCount }, () => pts[0]!)

  const out: LngLat[] = []
  const segLens: number[] = []
  for (let i = 1; i < pts.length; i++) {
    segLens.push(haversineMeters(pts[i - 1]!, pts[i]!))
  }

  for (let ti = 0; ti < targetCount; ti++) {
    const target = (ti / (targetCount - 1)) * total
    let acc = 0
    let si = 0
    while (si < segLens.length && acc + segLens[si]! < target) {
      acc += segLens[si]!
      si++
    }
    if (si >= pts.length - 1) {
      out.push(pts[pts.length - 1]!)
      continue
    }
    const segLen = segLens[si]!
    const u = segLen > 1e-9 ? (target - acc) / segLen : 0
    const a = pts[si]!
    const b = pts[si + 1]!
    out.push([
      a[0] + u * (b[0] - a[0]),
      a[1] + u * (b[1] - a[1]),
    ])
  }
  return out
}

export function lerpPolylines(
  a: LngLat[],
  b: LngLat[],
  t: number,
  samples: number,
): LngLat[] {
  const A = resamplePolyline(a, samples)
  const B = resamplePolyline(b, samples)
  return A.map((p, i) => {
    const q = B[i] ?? b[b.length - 1]!
    return [
      p[0] + (q[0] - p[0]) * t,
      p[1] + (q[1] - p[1]) * t,
    ] as LngLat
  })
}
