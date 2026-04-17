import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Map, {
  Layer,
  Popup,
  Source,
  type MapRef,
} from 'react-map-gl/mapbox'
import { animate } from 'framer-motion'
import type { ErrorEvent, MapMouseEvent, PaddingOptions } from 'mapbox-gl'
import type { FeatureCollection } from 'geojson'
import {
  isLikelyInvalidMapboxToken,
  MAPBOX_ACCESS_TOKEN,
  MAPBOX_STYLE_SATELLITE_STREETS,
  PORT_VIEW,
} from './map-config/viewport'
import { getValeRoutesFirstLngLat, valeRoutes } from './data/mapRoutes'
import {
  buildBlockedVisualization,
  buildGraphNodesDebugFeatureCollection,
  buildRoadGraph,
  buildValeMeshNodesFeatureCollection,
  expandBlockedEdgeIds,
  findNearestGraphEdge,
  findNearestNode,
  lineStringFeatureCollection,
  lerpPolylines,
  routingEngine,
  type LngLat,
} from './routing/routingEngine'
import { SupervisorPanel } from './supervisor/SupervisorPanel'
import { LocalSearch, type LocalSearchHit } from './map/LocalSearch'
import './MapCanvas.css'

const VALE_ROUTES_DATA = valeRoutes as FeatureCollection

/** Painéis à direita (desktop) ou em faixa inferior (compacto). Mesmo critério do `max-md` do Tailwind (abaixo de 768px). */
const CHROME_BREAKPOINT = '(max-width: 767px)'

const DEFAULT_DESKTOP_DOCK: PaddingOptions = {
  top: 12,
  bottom: 12,
  left: 14,
  right: 320,
}

function computeDockPadding(
  compact: boolean,
  chromeWidth: number,
  chromeHeight: number,
): PaddingOptions {
  const gap = 16
  if (compact) {
    const bottom = Math.max(chromeHeight, 168) + gap
    return { top: 10, left: 12, right: 12, bottom }
  }
  const right = Math.max(chromeWidth, 268) + gap
  return { top: 12, bottom: 12, left: 14, right }
}

function readInitialDockPadding(): PaddingOptions {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_DOCK
  return window.matchMedia(CHROME_BREAKPOINT).matches
    ? computeDockPadding(true, 0, 220)
    : DEFAULT_DESKTOP_DOCK
}

const INTERNAL_ROADS_GLOW_LAYER_ID = 'internal-roads-glow-layer'
const INTERNAL_ROADS_LAYER_ID = 'internal-roads-layer'

const ACTIVE_NAVIGATION_PATH_SOURCE_ID = 'active-navigation-path'
const ACTIVE_NAVIGATION_PATH_GLOW_LAYER_ID = 'active-navigation-path-glow'
const ACTIVE_NAVIGATION_PATH_LAYER_ID = 'active-navigation-path'

const BLOCKED_VIZ_SOURCE_ID = 'blocked-viz-source'
const BLOCKED_SEGMENT_GLOW_LAYER_ID = 'blocked-segments-glow-layer'
const BLOCKED_SEGMENT_LAYER_ID = 'blocked-segments-layer'

/** Nós do grafo (GeoJSON + camada); mantidos no mapa, invisíveis ao usuário. */
const GRAPH_NODES_DEBUG_SOURCE_ID = 'graph-connectivity-debug'
const GRAPH_NODES_DEBUG_LAYER_ID = 'graph-connectivity-debug-nodes'

const NEON_LINE_COLOR = '#00f2ff'

/** Rota calculada: núcleo verde + halo verde (linha contínua). */
const ACTIVE_NAVIGATION_PATH_COLOR = '#16a34a'
const ACTIVE_NAVIGATION_PATH_GLOW_COLOR = '#4ade80'

/** Trechos bloqueados: núcleo vermelho + halo vermelho (linha contínua). */
const BLOCKED_SEGMENT_COLOR = '#dc2626'
const BLOCKED_SEGMENT_GLOW_COLOR = '#f87171'

const INTERNAL_ROADS_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 1, 18, 5]

const INTERNAL_ROADS_GLOW_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 5, 18, 16]

const ACTIVE_NAVIGATION_PATH_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 10]

const ACTIVE_NAVIGATION_PATH_GLOW_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 12, 18, 26]

const BLOCKED_SEGMENT_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 8]

const BLOCKED_SEGMENT_GLOW_LINE_WIDTH: [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...number[],
] = ['interpolate', ['linear'], ['zoom'], 12, 14, 18, 24]

const [ROUTE_VIEW_LNG, ROUTE_VIEW_LAT] = getValeRoutesFirstLngLat()
const ROUTE_ALIGNED_VIEW = {
  ...PORT_VIEW,
  longitude: ROUTE_VIEW_LNG,
  latitude: ROUTE_VIEW_LAT,
} as const

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

async function geocodePlaces(query: string): Promise<LocalSearchHit[]> {
  const q = query.trim()
  if (!q) return []

  const params = new URLSearchParams({
    format: 'jsonv2',
    q,
    limit: '5',
    'accept-language': 'pt-BR,pt,en',
  })

  const res = await fetch(`${NOMINATIM_SEARCH}?${params}`, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) throw new Error(`Busca indisponível (${res.status}).`)
  const data = (await res.json()) as LocalSearchHit[]
  return Array.isArray(data) ? data : []
}

type RouteEndpoint = { id: string; lng: number; lat: number }

export function MapCanvas() {
  const mapRef = useRef<MapRef>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const chromeAsideRef = useRef<HTMLDivElement>(null)
  const chromeInnerRef = useRef<HTMLDivElement>(null)
  const prevPathRef = useRef<LngLat[] | null>(null)
  const morphAnimRef = useRef<{ stop: () => void } | null>(null)

  const [mapDockPadding, setMapDockPadding] = useState<PaddingOptions>(() =>
    readInitialDockPadding(),
  )

  const updateDockPadding = useCallback(() => {
    const aside = chromeAsideRef.current
    const inner = chromeInnerRef.current
    if (!aside || !inner || typeof window === 'undefined') return
    const compact = window.matchMedia(CHROME_BREAKPOINT).matches
    if (compact) {
      const h = aside.clientHeight || aside.offsetHeight
      setMapDockPadding(computeDockPadding(true, 0, h))
    } else {
      const w = inner.getBoundingClientRect().width
      setMapDockPadding(computeDockPadding(false, w, 0))
    }
  }, [])

  const roadGraph = useMemo(() => buildRoadGraph(VALE_ROUTES_DATA), [])
  const meshNodesFc = useMemo(
    () => buildValeMeshNodesFeatureCollection(roadGraph),
    [roadGraph],
  )
  const graphNodesDebugFc = useMemo(
    () => buildGraphNodesDebugFeatureCollection(roadGraph),
    [roadGraph],
  )

  const [placeQuery, setPlaceQuery] = useState('')
  const [searchResults, setSearchResults] = useState<LocalSearchHit[]>([])
  const [navError, setNavError] = useState<string | null>(null)
  const [navLoading, setNavLoading] = useState(false)
  const [mapLoadError, setMapLoadError] = useState<string | null>(null)
  const [routeSnap, setRouteSnap] = useState<{
    lng: number
    lat: number
    distanceM: number
    nodeId: string
  } | null>(null)

  const [supervisorMode, setSupervisorMode] = useState(false)
  const [listaBloqueios, setListaBloqueios] = useState<string[]>([])
  const blockedSet = useMemo(() => new Set(listaBloqueios), [listaBloqueios])

  const [pontoInicio, setPontoInicio] = useState<RouteEndpoint | null>(null)
  const [pontoChegada, setPontoChegada] = useState<RouteEndpoint | null>(null)

  const [activeRouteFc, setActiveRouteFc] =
    useState<FeatureCollection>(EMPTY_FC)
  const [routingHint, setRoutingHint] = useState<string | null>(null)

  const tokenMissingOrPlaceholder = isLikelyInvalidMapboxToken(
    MAPBOX_ACCESS_TOKEN,
  )

  const blockedVizFc = useMemo(
    () => buildBlockedVisualization(roadGraph, blockedSet),
    [roadGraph, blockedSet],
  )

  const resizeMap = useCallback(() => {
    mapRef.current?.getMap()?.resize()
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => resizeMap())
    ro.observe(el)
    window.addEventListener('orientationchange', resizeMap)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', resizeMap)
    }
  }, [resizeMap])

  useLayoutEffect(() => {
    updateDockPadding()
  }, [updateDockPadding])

  useEffect(() => {
    const aside = chromeAsideRef.current
    const inner = chromeInnerRef.current
    if (!aside || !inner || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => updateDockPadding())
    ro.observe(aside)
    ro.observe(inner)
    const mql = window.matchMedia(CHROME_BREAKPOINT)
    mql.addEventListener('change', updateDockPadding)
    window.addEventListener('resize', updateDockPadding)
    return () => {
      ro.disconnect()
      mql.removeEventListener('change', updateDockPadding)
      window.removeEventListener('resize', updateDockPadding)
    }
  }, [updateDockPadding])

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    map.setPadding(mapDockPadding)
  }, [mapDockPadding])

  useEffect(() => {
    return () => {
      morphAnimRef.current?.stop()
    }
  }, [])

  const morphToPath = useCallback((next: LngLat[]) => {
    morphAnimRef.current?.stop()
    if (next.length < 2) {
      prevPathRef.current = null
      setActiveRouteFc(EMPTY_FC)
      return
    }
    const prev = prevPathRef.current
    prevPathRef.current = next
    if (!prev || prev.length < 2) {
      setActiveRouteFc(lineStringFeatureCollection(next))
      return
    }
    const samples = Math.min(
      120,
      Math.max(40, Math.max(prev.length, next.length) * 3),
    )
    const sub = animate(0, 1, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        setActiveRouteFc(
          lineStringFeatureCollection(
            lerpPolylines(prev, next, v, samples),
          ),
        )
      },
      onComplete: () => {
        setActiveRouteFc(lineStringFeatureCollection(next))
      },
    })
    morphAnimRef.current = sub
  }, [])

  useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      morphAnimRef.current?.stop()

      if (!pontoInicio || !pontoChegada) {
        prevPathRef.current = null
        setActiveRouteFc(EMPTY_FC)
        setRoutingHint(null)
        return
      }

      const outcome = routingEngine.calculatePath(
        roadGraph,
        pontoInicio.id,
        pontoChegada.id,
        blockedSet,
        supervisorMode,
      )

      if (!alive) return

      if (outcome.status === 'IMPOSSIBLE') {
        setRoutingHint(outcome.message)
        morphToPath([])
        return
      }

      morphToPath(outcome.path)
      setRoutingHint(null)
    })
    return () => {
      alive = false
    }
  }, [
    roadGraph,
    pontoInicio,
    pontoChegada,
    listaBloqueios,
    blockedSet,
    supervisorMode,
    morphToPath,
  ])

  const onMapLoad = useCallback(() => {
    setMapLoadError(null)
    const map = mapRef.current?.getMap()
    if (map) map.setPadding(mapDockPadding)
    queueMicrotask(() => {
      resizeMap()
    })
  }, [resizeMap, mapDockPadding])

  const onMapError = useCallback((e: ErrorEvent) => {
    if (isLikelyInvalidMapboxToken(MAPBOX_ACCESS_TOKEN)) return
    const msg =
      e.error?.message?.trim() ||
      'Falha ao carregar o mapa (token ou rede). Verifique o access token Mapbox.'
    setMapLoadError(msg)
  }, [])

  const flyToPort = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    setNavError(null)
    setRouteSnap(null)
    setSearchResults([])
    map.setPadding(mapDockPadding)
    map.flyTo({
      center: [ROUTE_ALIGNED_VIEW.longitude, ROUTE_ALIGNED_VIEW.latitude],
      zoom: ROUTE_ALIGNED_VIEW.zoom,
      pitch: ROUTE_ALIGNED_VIEW.pitch,
      bearing: ROUTE_ALIGNED_VIEW.bearing,
      padding: mapDockPadding,
      duration: 1400,
      essential: true,
    })
  }, [mapDockPadding])

  const flyToPlaceHit = useCallback((hit: LocalSearchHit) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    setNavError(null)
    setRouteSnap(null)
    setSearchResults([])

    const lat = parseFloat(hit.lat)
    const lon = parseFloat(hit.lon)
    const bbox = hit.boundingbox

    map.setPadding(mapDockPadding)

    const pt = mapDockPadding.top ?? 0
    const pb = mapDockPadding.bottom ?? 0
    const pl = mapDockPadding.left ?? 0
    const pr = mapDockPadding.right ?? 0

    if (
      bbox &&
      bbox.length === 4 &&
      bbox.every((v) => v !== '' && !Number.isNaN(Number.parseFloat(v)))
    ) {
      const south = parseFloat(bbox[0])
      const north = parseFloat(bbox[1])
      const west = parseFloat(bbox[2])
      const east = parseFloat(bbox[3])
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: 40 + pt,
            bottom: 40 + pb,
            left: 40 + pl,
            right: 40 + pr,
          },
          maxZoom: 16,
          duration: 1600,
          pitch: PORT_VIEW.pitch,
          essential: true,
        },
      )
      return
    }

    map.flyTo({
      center: [lon, lat],
      zoom: 14,
      pitch: PORT_VIEW.pitch,
      bearing: 0,
      padding: mapDockPadding,
      duration: 1400,
      essential: true,
    })
  }, [mapDockPadding])

  const handleSearchSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const q = placeQuery.trim()
      if (!q) {
        setNavError('Digite uma cidade ou endereço.')
        setSearchResults([])
        return
      }

      setNavError(null)
      setSearchResults([])
      setNavLoading(true)
      try {
        const hits = await geocodePlaces(q)
        if (!hits.length) {
          setNavError('Nenhum resultado encontrado. Tente outro termo.')
          return
        }
        setSearchResults(hits)
      } catch {
        setNavError('Não foi possível buscar o local. Verifique a conexão.')
      } finally {
        setNavLoading(false)
      }
    },
    [placeQuery],
  )

  const onRouteMapClick = useCallback(
    (e: MapMouseEvent) => {
      const map = mapRef.current?.getMap()
      if (!map) return

      const lng = e.lngLat.lng
      const lat = e.lngLat.lat

      if (supervisorMode) {
        const hitLine =
          map.queryRenderedFeatures(e.point, {
            layers: [INTERNAL_ROADS_LAYER_ID],
          }).length > 0
        const maxEdge = hitLine ? 55 : 28
        const edgeHit = findNearestGraphEdge(roadGraph, lng, lat, maxEdge)
        if (!edgeHit) return
        setListaBloqueios((prev) => {
          const parallel = expandBlockedEdgeIds(
            roadGraph,
            new Set([edgeHit.edgeId]),
          )
          const ids = [...parallel]
          const allBlocked = ids.length > 0 && ids.every((id) => prev.includes(id))
          if (allBlocked) {
            return prev.filter((id) => !ids.includes(id))
          }
          return [...new Set([...prev, ...ids])]
        })
        setRouteSnap(null)
        return
      }

      const hitLine =
        map.queryRenderedFeatures(e.point, {
          layers: [INTERNAL_ROADS_LAYER_ID],
        }).length > 0

      const maxM = hitLine ? 220 : 110
      const node = findNearestNode([lng, lat], meshNodesFc, maxM)

      if (!node) {
        setRouteSnap(null)
        return
      }

      setRouteSnap({
        lng: node.lng,
        lat: node.lat,
        distanceM: node.distanceM,
        nodeId: node.id,
      })
    },
    [roadGraph, meshNodesFc, supervisorMode],
  )

  return (
    <div className="map-canvas">
      <div ref={viewportRef} className="map-canvas__viewport">
        <div className="map-canvas__map-root">
          <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
            mapStyle={MAPBOX_STYLE_SATELLITE_STREETS}
            initialViewState={{
              ...ROUTE_ALIGNED_VIEW,
              padding: mapDockPadding,
            }}
            style={{
              width: '100%',
              height: '100%',
            }}
            attributionControl={false}
            maxPitch={0}
            touchPitch={false}
            interactiveLayerIds={[INTERNAL_ROADS_LAYER_ID]}
            cursor="pointer"
            onClick={onRouteMapClick}
            onLoad={onMapLoad}
            onError={onMapError}
          >
            <Source id="vale-internal-roads" type="geojson" data={VALE_ROUTES_DATA}>
              <Layer
                id={INTERNAL_ROADS_GLOW_LAYER_ID}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': NEON_LINE_COLOR,
                  'line-width': INTERNAL_ROADS_GLOW_LINE_WIDTH,
                  'line-blur': 4,
                  'line-opacity': 0.5,
                }}
              />
              <Layer
                id={INTERNAL_ROADS_LAYER_ID}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': NEON_LINE_COLOR,
                  'line-width': INTERNAL_ROADS_LINE_WIDTH,
                  'line-blur': 0.35,
                  'line-opacity': 0.95,
                }}
              />
            </Source>

            <Source
              id={GRAPH_NODES_DEBUG_SOURCE_ID}
              type="geojson"
              data={graphNodesDebugFc}
            >
              <Layer
                id={GRAPH_NODES_DEBUG_LAYER_ID}
                type="circle"
                layout={{ visibility: 'none' }}
                paint={{
                  'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    13,
                    2.5,
                    18,
                    6,
                  ],
                  'circle-color': '#e040fb',
                  'circle-opacity': 0.92,
                  'circle-stroke-width': 1,
                  'circle-stroke-color': '#ffffff',
                }}
              />
            </Source>

            <Source id={BLOCKED_VIZ_SOURCE_ID} type="geojson" data={blockedVizFc}>
              <Layer
                id={BLOCKED_SEGMENT_GLOW_LAYER_ID}
                type="line"
                filter={['==', ['get', 'kind'], 'blocked-segment']}
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': BLOCKED_SEGMENT_GLOW_COLOR,
                  'line-width': BLOCKED_SEGMENT_GLOW_LINE_WIDTH,
                  'line-blur': 5,
                  'line-opacity': 0.42,
                }}
              />
              <Layer
                id={BLOCKED_SEGMENT_LAYER_ID}
                type="line"
                filter={['==', ['get', 'kind'], 'blocked-segment']}
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': BLOCKED_SEGMENT_COLOR,
                  'line-width': BLOCKED_SEGMENT_LINE_WIDTH,
                  'line-blur': 0.35,
                  'line-opacity': 0.96,
                }}
              />
            </Source>

            <Source
              id={ACTIVE_NAVIGATION_PATH_SOURCE_ID}
              type="geojson"
              data={activeRouteFc}
            >
              <Layer
                id={ACTIVE_NAVIGATION_PATH_GLOW_LAYER_ID}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': ACTIVE_NAVIGATION_PATH_GLOW_COLOR,
                  'line-width': ACTIVE_NAVIGATION_PATH_GLOW_LINE_WIDTH,
                  'line-blur': 5,
                  'line-opacity': 0.48,
                }}
              />
              <Layer
                id={ACTIVE_NAVIGATION_PATH_LAYER_ID}
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': ACTIVE_NAVIGATION_PATH_COLOR,
                  'line-width': ACTIVE_NAVIGATION_PATH_LINE_WIDTH,
                  'line-blur': 0.35,
                  'line-opacity': 0.98,
                }}
              />
            </Source>

            {routeSnap ? (
              <Popup
                longitude={routeSnap.lng}
                latitude={routeSnap.lat}
                anchor="bottom"
                onClose={() => setRouteSnap(null)}
                closeOnClick={false}
                offset={10}
              >
                <div className="map-route-snap-popup">
                  <strong>Nó da malha</strong>
                  <div className="map-route-snap-popup__coords">
                    {routeSnap.lat.toFixed(5)}, {routeSnap.lng.toFixed(5)}
                  </div>
                  <div className="map-route-snap-popup__meta">
                    ≈ {routeSnap.distanceM.toFixed(1)} m do clique
                  </div>
                  <div className="map-route-snap-popup__node-id" title={routeSnap.nodeId}>
                    ID: {routeSnap.nodeId.slice(0, 18)}
                    {routeSnap.nodeId.length > 18 ? '…' : ''}
                  </div>
                  <div className="map-route-snap-popup__actions">
                    <button
                      type="button"
                      className="map-route-snap-popup__btn map-route-snap-popup__btn--origin"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setPontoInicio({
                          id: routeSnap.nodeId,
                          lng: routeSnap.lng,
                          lat: routeSnap.lat,
                        })
                        setRouteSnap(null)
                      }}
                    >
                      Partida
                    </button>
                    <button
                      type="button"
                      className="map-route-snap-popup__btn map-route-snap-popup__btn--dest"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setPontoChegada({
                          id: routeSnap.nodeId,
                          lng: routeSnap.lng,
                          lat: routeSnap.lat,
                        })
                        setRouteSnap(null)
                      }}
                    >
                      Chegada
                    </button>
                  </div>
                </div>
              </Popup>
            ) : null}
          </Map>
        </div>

        <div
          className="pointer-events-none absolute left-2 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[25] max-w-[min(calc(100vw-1.25rem),18rem)] rounded-md border border-cyan-500/25 bg-slate-900/55 px-2 py-1.5 shadow-[0_0_20px_rgba(6,182,212,0.12)] backdrop-blur-md md:left-3 md:top-3 md:max-w-[min(calc(100%-320px),20rem)] md:px-2.5 md:py-1.5"
          aria-label="Vale — identificação"
        >
          <span className="pointer-events-auto block text-[11px] font-semibold tracking-tight text-neutral-200 md:text-xs">
            Vale · Monitoramento portuário
          </span>
          <span className="pointer-events-auto mt-0.5 block text-[9px] leading-snug text-neutral-500 md:text-[10px]">
            Ponta da Madeira — visão operacional
          </span>
        </div>

        <aside
          ref={chromeAsideRef}
          className="pointer-events-none absolute z-[20] flex flex-col gap-2 max-md:inset-x-3 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-md:top-auto max-md:max-h-[min(44dvh,20rem)] max-md:w-auto max-md:min-h-0 max-md:overflow-y-auto max-md:overscroll-contain md:inset-y-4 md:bottom-auto md:left-auto md:right-4 md:top-4 md:max-h-none md:w-[300px] md:overflow-visible md:gap-4"
          aria-label="Painéis de controle"
        >
          <div
            ref={chromeInnerRef}
            className="pointer-events-auto flex w-full min-w-0 flex-col gap-2 md:max-w-[300px] md:gap-4"
          >
            <SupervisorPanel
              supervisorMode={supervisorMode}
              onSupervisorModeChange={setSupervisorMode}
              blockedCount={listaBloqueios.length}
              onClearBlocks={() => setListaBloqueios([])}
              hasOrigin={pontoInicio !== null}
              hasDestination={pontoChegada !== null}
              onClearRoute={() => {
                setPontoInicio(null)
                setPontoChegada(null)
                setRoutingHint(null)
                morphAnimRef.current?.stop()
                prevPathRef.current = null
                setActiveRouteFc(EMPTY_FC)
              }}
              routingHint={routingHint}
            />
            <LocalSearch
              query={placeQuery}
              onQueryChange={setPlaceQuery}
              onSubmit={handleSearchSubmit}
              loading={navLoading}
              error={navError}
              results={searchResults}
              onSelectHit={flyToPlaceHit}
              onFlyToPort={flyToPort}
            />
          </div>
        </aside>

        {tokenMissingOrPlaceholder ? (
          <div className="map-canvas__token-banner">
            Configure um token público Mapbox no arquivo <code>.env</code>:{' '}
            <code>VITE_MAPBOX_ACCESS_TOKEN=pk.seu_token</code>
            , reinicie o <code>npm run dev</code>. Sem isso, o estilo satélite não
            carrega.
          </div>
        ) : null}

        {mapLoadError ? (
          <div className="map-canvas__map-error" role="alert">
            {mapLoadError}
          </div>
        ) : null}
      </div>
    </div>
  )
}
