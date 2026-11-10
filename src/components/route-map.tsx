import * as React from "react"
import { Map as MapLibre, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { CircleDashed, MousePointer2, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import { cn } from "cn"

import { IconButton } from "@/components/icon-button"
import { Button } from "@/components/ui/button"
import { ROUTE_BY_ID, fmtNum, type Route } from "@/lib/eddm"

/** Free vector basemap (OpenStreetMap data, served by OpenFreeMap). No key needed. */
const STYLE = "https://tiles.openfreemap.org/styles/positron"
/** Radius of the Area tool's circle, in screen pixels (it keeps its size when the map zooms). */
const AREA_RADIUS = 56
const KM_PER_MILE = 1.609344
/** Width of one stripe on a route that is in several waves, in pixels. */
const STRIPE = 6
const INK = "#18181b"
/** Width of the side panel, in pixels. */
const PANEL_WIDTH = 300
const PADDING = { top: 64, bottom: 60, left: 32, right: 32 }

type Bounds = [[number, number], [number, number]]
type Point = { x: number; y: number }
type RGB = [number, number, number]

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** True when the shape touches the circle: an edge crosses it, or the centre is inside the shape. */
function touchesCircle(pts: Point[], c: Point, r: number) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const { x: x1, y: y1 } = pts[j]
    const { x: x2, y: y2 } = pts[i]
    const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
    const t = len2 ? clamp(((c.x - x1) * (x2 - x1) + (c.y - y1) * (y2 - y1)) / len2, 0, 1) : 0
    if (Math.hypot(c.x - (x1 + t * (x2 - x1)), c.y - (y1 + t * (y2 - y1))) <= r) return true
    if (y1 > c.y !== y2 > c.y && c.x < ((x2 - x1) * (c.y - y1)) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

/** The map cannot read CSS variables or oklch(), so theme colours are converted to RGB once. */
const rgbCache = new Map<string, RGB>()
function toRgb(css: string): RGB {
  const hit = rgbCache.get(css)
  if (hit) return hit
  const probe = document.createElement("span")
  probe.style.color = css
  document.body.append(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  const rgb: RGB = [r, g, b]
  rgbCache.set(css, rgb)
  return rgb
}

/** Diagonal stripes, one per wave, as a tile that repeats without seams. */
function stripes(colors: RGB[]) {
  const w = STRIPE * 2 // drawn at 2x for sharp edges
  const size = colors.length * w
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = colors[Math.floor(((x + y) % size) / w)]
      data.set([c[0], c[1], c[2], 255], (y * size + x) * 4)
    }
  return { width: size, height: size, data }
}

/** Routes that touch the Area circle at a point on screen. */
function routesAt(map: MapLibre, routes: Route[], at: Point) {
  return routes.filter((route) =>
    touchesCircle(
      route.points.map((p) => map.project(p)),
      at,
      AREA_RADIUS
    )
  )
}

/** A circle on the ground: `miles` around `center`, as [longitude, latitude] points. */
function ring([lng, lat]: [number, number], miles: number, steps = 96): [number, number][] {
  const km = miles * KM_PER_MILE
  const kmPerLng = 111.32 * Math.cos((lat * Math.PI) / 180)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return [lng + (Math.cos(a) * km) / kmPerLng, lat + (Math.sin(a) * km) / 110.574]
  })
}

function boundsOf(center: [number, number], miles: number): Bounds {
  const pts = ring(center, miles, 4)
  return [
    [pts[2][0], pts[3][1]],
    [pts[0][0], pts[1][1]],
  ]
}

/**
 * Every control that floats on the map uses this container: 36px tall, with 28px buttons inside.
 * Controls sit 12px from the map edge and 6px from each other.
 */
export const MAP_PILL =
  "flex items-center gap-0.5 rounded-lg bg-background p-1 shadow-sm ring-1 ring-foreground/10"

export type MapTools = {
  /** Routes to draw: the ones inside the radius, and every selected route */
  routes: Route[]
  /** The searched place, as [longitude, latitude]. When it changes, the map flies there. */
  center: [number, number]
  /** Name of the searched place */
  place: string
  /** A route to show: the map flies to it and centres it. `key` changes on each request. */
  focus?: { id: string; key: number }
  /** Routes load up to this many miles from the place */
  radius: number
  onRadiusChange: (miles: number) => void
  /** Area tool: routes that touch the circle where the user clicked */
  onAddArea: (routes: Route[]) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

type Props = MapTools & {
  /** routeId -> colours of the waves it belongs to, in mailing order */
  colors: Record<string, string[]>
  /** Lower part of the hover card: the waves the route is in, and what a click does */
  hint?: (route: Route) => React.ReactNode
  onToggle?: (route: Route) => void
  /** Ids of the routes that fit the audience filters. They get a marker and a tint. */
  highlight?: Set<string>
  /** Zoom with the scroll wheel alone. Off for a map inside a scrolling page: there the wheel scrolls the page. */
  scrollZoom?: boolean
  /** Shown above the zoom buttons, with the other view controls (the Open map button) */
  viewControl?: React.ReactNode
  /** A panel on the right, inside the map (the audience filters). The map moves its content into the space that is left. */
  sidePanel?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function RouteMap({
  routes,
  focus,
  center,
  radius,
  colors,
  hint,
  onToggle,
  highlight,
  scrollZoom = true,
  viewControl,
  sidePanel,
  onAddArea,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  className,
  children,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null)
  const container = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<MapLibre | null>(null)
  const [ready, setReady] = React.useState(false)
  const [hover, setHover] = React.useState<{ route: Route; x: number; y: number } | null>(null)
  const [tool, setTool] = React.useState<"route" | "area">("route")
  /** Area tool: where the circle is, in pixels from the map's top-left corner */
  const [cursor, setCursor] = React.useState<Point | null>(null)
  const [touching, setTouching] = React.useState<string[]>([])
  const hovered = React.useRef<string | null>(null)

  // Map event handlers are attached once; they read the latest props and state from here.
  const live = React.useRef({ tool, onToggle, onAddArea, routes })
  live.current = { tool, onToggle, onAddArea, routes }

  const initialBounds = React.useRef(boundsOf(center, radius))
  React.useEffect(() => {
    const map = new MapLibre({
      container: container.current!,
      style: STYLE,
      bounds: initialBounds.current,
      fitBoundsOptions: { padding: PADDING },
      // Prototype only: the map credits are hidden. A public version must credit OpenStreetMap and OpenFreeMap.
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxZoom: 17,
      minZoom: 3,
    })
    mapRef.current = map
    // Inside a scrolling page the wheel scrolls the page, with no message over the map.
    // Pinch, or the wheel with Ctrl or Cmd held, still zooms.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) map.scrollZoom.enable()
      else map.scrollZoom.disable()
    }
    const wheelTarget = container.current!
    if (!scrollZoom) {
      map.scrollZoom.disable()
      wheelTarget.addEventListener("wheel", onWheel, { capture: true })
    }
    map.touchZoomRotate.disableRotation()

    map.on("load", () => {
      const empty = { type: "FeatureCollection" as const, features: [] }
      map.addSource("routes", { type: "geojson", data: empty, promoteId: "id" })
      map.addSource("fits", { type: "geojson", data: empty })
      map.addSource("place", { type: "geojson", data: empty })
      // Routes go under the basemap's labels, so street and place names stay readable.
      const labels = map.getStyle().layers.find((l) => l.type === "symbol")?.id
      const hoverOn = ["boolean", ["feature-state", "hover"], false]
      const touchOn = ["boolean", ["get", "touching"], false]
      const fitOn = ["boolean", ["get", "fit"], false]
      const strong = ["case", ["any", hoverOn, touchOn], 0.6, 0.42]
      const add = (layer: Record<string, unknown>) => map.addLayer(layer as never, labels)
      add({
        id: "routes-empty",
        type: "fill",
        source: "routes",
        filter: ["!", ["has", "color"]],
        paint: {
          "fill-color": INK,
          "fill-opacity": ["case", touchOn, 0.14, hoverOn, 0.1, fitOn, 0.1, 0],
        },
      })
      add({
        id: "routes-solid",
        type: "fill",
        source: "routes",
        filter: ["all", ["has", "color"], ["!", ["has", "pattern"]]],
        paint: { "fill-color": ["get", "color"], "fill-opacity": strong },
      })
      add({
        id: "routes-striped",
        type: "fill",
        source: "routes",
        filter: ["has", "pattern"],
        paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": strong },
      })
      add({
        id: "routes-outline",
        type: "line",
        source: "routes",
        filter: ["!", ["has", "color"]],
        paint: { "line-color": INK, "line-opacity": ["case", fitOn, 0.6, 0.28], "line-width": 1 },
      })
      add({
        id: "routes-outline-selected",
        type: "line",
        source: "routes",
        filter: ["has", "color"],
        paint: { "line-color": ["get", "color"], "line-width": 2 },
      })
      add({
        id: "fits",
        type: "circle",
        source: "fits",
        paint: {
          "circle-radius": 4.5,
          "circle-color": INK,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      })
      // The searched place.
      map.addLayer({
        id: "place",
        type: "circle",
        source: "place",
        paint: {
          "circle-radius": 6,
          "circle-color": `rgb(${toRgb("var(--primary)").join(",")})`,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      })
      setReady(true)
    })

    const routeUnder = (e: MapMouseEvent) => {
      const f = map.getLayer("routes-empty")
        ? map.queryRenderedFeatures(e.point, { layers: ["routes-empty", "routes-solid", "routes-striped"] })[0]
        : undefined
      return f ? ROUTE_BY_ID[f.properties.id as string] : undefined
    }
    const setHovered = (id: string | null) => {
      if (hovered.current === id) return
      if (hovered.current) map.setFeatureState({ source: "routes", id: hovered.current }, { hover: false })
      if (id) map.setFeatureState({ source: "routes", id }, { hover: true })
      hovered.current = id
    }

    map.on("mousemove", (e) => {
      if (live.current.tool === "area") {
        setHovered(null)
        setHover(null)
        setCursor({ x: e.point.x, y: e.point.y })
        setTouching(routesAt(map, live.current.routes, e.point).map((r) => r.id))
        return
      }
      const route = live.current.onToggle ? routeUnder(e) : undefined
      setHovered(route?.id ?? null)
      setHover(route ? { route, x: e.point.x, y: e.point.y } : null)
      map.getCanvas().style.cursor = route ? "pointer" : ""
    })
    map.on("mouseout", () => {
      setHovered(null)
      setHover(null)
      setCursor(null)
      setTouching([])
    })
    map.on("movestart", () => setHover(null))
    // A drag pans the map and does not fire `click`, so a click always means "select".
    map.on("click", (e) => {
      if (live.current.tool === "area") {
        const hit = routesAt(map, live.current.routes, e.point)
        if (hit.length) live.current.onAddArea?.(hit)
        return
      }
      const route = routeUnder(e)
      if (route) live.current.onToggle?.(route)
    })

    return () => {
      wheelTarget.removeEventListener("wheel", onWheel, { capture: true })
      setReady(false)
      mapRef.current = null
      hovered.current = null
      map.remove()
    }
  }, [scrollZoom])

  // Fly to a new place; ease when only the radius changes.
  const placeKey = center.join(",")
  const shown = React.useRef({ placeKey, radius })
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || (shown.current.placeKey === placeKey && shown.current.radius === radius)) return
    const moved = shown.current.placeKey !== placeKey
    shown.current = { placeKey, radius }
    const camera = map.cameraForBounds(boundsOf(center, radius), { padding: PADDING })
    if (!camera) return
    if (moved) map.flyTo({ ...camera, duration: 2600, essential: true })
    else map.easeTo({ ...camera, duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKey, radius])

  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource("place") as GeoJSONSource).setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: center },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, placeKey])

  // Show one route. This runs after the fly-to-place above, so it wins when the place also changed.
  const focusKey = focus?.key
  React.useEffect(() => {
    const map = mapRef.current
    const route = focus ? ROUTE_BY_ID[focus.id] : undefined
    if (!map || !ready || !route) return
    map.flyTo({ center: [route.cx, route.cy], zoom: 13.4, duration: 1800, essential: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready])

  // Push wave colours, audience fits and the Area preview to the map.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const touched = new Set(touching)
    const features = routes.map((r) => {
      const list = colors[r.id]
      let pattern: string | undefined
      if (list && list.length > 1) {
        pattern = `stripes-${list.join("|")}`
        if (!map.hasImage(pattern)) map.addImage(pattern, stripes(list.map(toRgb)), { pixelRatio: 2 })
      }
      return {
        type: "Feature" as const,
        properties: {
          id: r.id,
          ...(list ? { color: `rgb(${toRgb(list[0]).join(",")})` } : null),
          ...(pattern ? { pattern } : null),
          fit: Boolean(highlight?.has(r.id)),
          touching: touched.has(r.id),
        },
        geometry: { type: "Polygon" as const, coordinates: [[...r.points, r.points[0]]] },
      }
    })
    ;(map.getSource("routes") as GeoJSONSource).setData({ type: "FeatureCollection", features })
    ;(map.getSource("fits") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: routes.filter((r) => highlight?.has(r.id)).map((r) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [r.cx, r.cy] },
      })),
    })
  }, [ready, routes, colors, highlight, touching])

  // While the side panel is open, the map treats that strip as covered and keeps the routes in view beside it.
  const panelOpen = Boolean(sidePanel)
  React.useEffect(() => {
    if (!ready) return
    mapRef.current?.easeTo({
      padding: { top: 0, bottom: 0, left: 0, right: panelOpen ? PANEL_WIDTH : 0 },
      duration: 300,
    })
  }, [panelOpen, ready])

  React.useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = tool === "area" ? "crosshair" : ""
  }, [tool, ready])

  const pill = MAP_PILL

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden rounded-lg border bg-muted", className)}
      role="group"
      aria-label="Carrier routes map"
      style={{ "--map-panel": panelOpen ? `${PANEL_WIDTH}px` : "0px" } as React.CSSProperties}
    >
      <div ref={container} className="absolute! inset-0" />

      {tool === "area" && cursor && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border-2 border-dashed border-primary bg-primary/10"
          style={{
            left: cursor.x - AREA_RADIUS,
            top: cursor.y - AREA_RADIUS,
            width: AREA_RADIUS * 2,
            height: AREA_RADIUS * 2,
          }}
        />
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-max min-w-44 overflow-hidden rounded-lg bg-popover text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          style={{
            left: Math.min(hover.x + 14, (ref.current?.clientWidth ?? 0) - 230 - (panelOpen ? PANEL_WIDTH : 0)),
            // Near the bottom edge the card opens above the pointer, so the map does not cut it off.
            ...(hover.y > (ref.current?.clientHeight ?? 0) - 170
              ? { bottom: (ref.current?.clientHeight ?? 0) - hover.y + 10 }
              : { top: hover.y + 14 }),
          }}
        >
          <div className="px-3 py-2">
            <div className="text-[0.8125rem] font-medium tabular-nums">Route {hover.route.id}</div>
            <div className="text-muted-foreground tabular-nums">
              {fmtNum(hover.route.residences)} residences
            </div>
          </div>
          {highlight?.has(hover.route.id) && (
            <div className="flex items-center gap-1.5 border-t px-3 py-1.5">
              <span className="size-2.5 rounded-full bg-foreground" /> Fits your audience filters
            </div>
          )}
          {hint?.(hover.route)}
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
        <div className={pill} role="group" aria-label="Selection tool">
          {(
            [
              ["route", "Route", MousePointer2],
              ["area", "Area", CircleDashed],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              size="sm"
              variant={tool === value ? "secondary" : "ghost"}
              aria-pressed={tool === value}
              onClick={() => {
                setTool(value)
                setHover(null)
              }}
            >
              <Icon /> {label}
            </Button>
          ))}
        </div>
        <div className={pill}>
          <IconButton variant="ghost" size="icon-sm" label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 />
          </IconButton>
          <IconButton variant="ghost" size="icon-sm" label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 />
          </IconButton>
        </div>
      </div>

      {/* View controls: how the user looks at the map */}
      <div className="absolute right-[calc(var(--map-panel)+0.75rem)] bottom-3 flex flex-col items-end gap-1.5 transition-[right] duration-300">
        {viewControl}
        <div className={cn(pill, "flex-col")}>
        <IconButton
          variant="ghost"
          size="icon-sm"
          label="Zoom in"
          side="left"
          onClick={() => mapRef.current?.zoomIn({ duration: 350 })}
        >
          <ZoomIn />
        </IconButton>
        <IconButton
          variant="ghost"
          size="icon-sm"
          label="Zoom out"
          side="left"
          onClick={() => mapRef.current?.zoomOut({ duration: 350 })}
        >
          <ZoomOut />
        </IconButton>
        </div>
      </div>
      {children}
      {sidePanel && (
        <div
          className="absolute inset-y-0 right-0 z-10 flex flex-col border-l bg-background shadow-lg duration-300 animate-in slide-in-from-right"
          style={{ width: PANEL_WIDTH }}
        >
          {sidePanel}
        </div>
      )}
    </div>
  )
}
