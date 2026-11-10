import {
  addBusinessDays,
  addDays,
  format,
  isSameDay,
  isWeekend,
  startOfDay,
} from "date-fns"
import { Delaunay } from "d3-delaunay"

/* ---------------------------------------------------------------- routes */

export type Route = {
  id: string
  zip: string
  code: string
  /** Location id */
  location: string
  residences: number
  /** Outline as [longitude, latitude] pairs */
  points: [number, number][]
  /** Centre, as longitude and latitude */
  cx: number
  cy: number
  /** Position inside its location, 0 to 1 from west to east and north to south */
  nx: number
  ny: number
  /** Miles from the location's centre to the nearest part of the route (0 when the centre is on it) */
  reach: number
  order: number
  /** Audience category id -> the groups that are most common on this route */
  audience: Record<string, string[]>
}

/* -------------------------------------------------------------- audience */

/** `ordered` categories are scales (age, income): a route has two neighbouring groups. */
export type AudienceCategory = { id: string; label: string; options: string[]; ordered?: boolean }

export const AUDIENCE: AudienceCategory[] = [
  { id: "age", label: "Age", ordered: true, options: ["20–24", "25–34", "35–44", "45–54", "55–64", "65–74", "75+"] },
  { id: "gender", label: "Gender", options: ["Female", "Male"] },
  {
    id: "income",
    label: "Income",
    ordered: true,
    options: ["$0–59K", "$60–90K", "$91–115K", "$116–150K", "$151–200K", "$200K+"],
  },
  {
    id: "household",
    label: "Household size",
    ordered: true,
    options: ["1 resident", "2 residents", "3 residents", "4 residents", "5 or more"],
  },
  {
    id: "education",
    label: "Education",
    ordered: true,
    options: [
      "No diploma",
      "High school graduate",
      "College, no diploma",
      "Associate degree",
      "Bachelor's degree",
      "Graduate degree",
    ],
  },
  { id: "ownership", label: "Household ownership", options: ["Owner-occupied", "Renter-occupied"] },
  { id: "insurance", label: "Health insurance", options: ["Insured", "Uninsured"] },
]

/** Category id -> selected groups. An empty or missing list means the category is not filtered. */
export type AudienceFilters = Record<string, string[]>

export const countFilters = (filters: AudienceFilters) =>
  Object.values(filters).reduce((s, list) => s + list.length, 0)

/** A route fits when, for every category with a selection, one of the selected groups is common on it. */
export function fitsAudience(route: Route, filters: AudienceFilters) {
  const active = AUDIENCE.filter((c) => filters[c.id]?.length)
  return (
    active.length > 0 &&
    active.every((c) => filters[c.id].some((o) => route.audience[c.id].includes(o)))
  )
}

/* ------------------------------------------------------------- locations */

/**
 * Places the search box knows. `zips` is a 3 x 3 grid, north-west to south-east.
 * Route shapes are generated around `center`; they are not real carrier routes.
 */
export type Location = {
  id: string
  label: string
  /** Second line in the search results: street, city, state */
  detail?: string
  /** [longitude, latitude] */
  center: [number, number]
  zips: string[][]
}

/** How far from the searched place routes are loaded, in miles. The user sets it with a slider. */
export const RADIUS = { min: 0.5, max: 2, step: 0.25, initial: 1 }
const KM_PER_MILE = 1.609344

// Routes are generated in a square around the place, a little larger than the largest radius.
const AREA_W = 8 // km
const AREA_H = 8
const COLS = 14
const ROWS = 14

const PLACES: Location[] = [
  {
    id: "richmond",
    label: "Richmond, VA",
    center: [-77.4605, 37.5538],
    zips: [
      ["23226", "23230", "23227"],
      ["23221", "23220", "23222"],
      ["23225", "23224", "23223"],
    ],
  },
  {
    id: "charlotte",
    label: "Charlotte, NC",
    center: [-80.8431, 35.2271],
    zips: [
      ["28216", "28206", "28205"],
      ["28208", "28202", "28204"],
      ["28217", "28203", "28209"],
    ],
  },
  {
    id: "nashville",
    label: "Nashville, TN",
    center: [-86.7816, 36.1627],
    zips: [
      ["37209", "37208", "37207"],
      ["37205", "37203", "37206"],
      ["37215", "37212", "37210"],
    ],
  },
  {
    id: "austin",
    label: "Austin, TX",
    center: [-97.7431, 30.2672],
    zips: [
      ["78703", "78705", "78722"],
      ["78746", "78701", "78702"],
      ["78704", "78741", "78721"],
    ],
  },
  {
    id: "denver",
    label: "Denver, CO",
    center: [-104.9903, 39.7392],
    zips: [
      ["80211", "80202", "80205"],
      ["80204", "80203", "80206"],
      ["80219", "80223", "80209"],
    ],
  },
  {
    id: "brooklyn",
    label: "Brooklyn, NY",
    center: [-73.9442, 40.6782],
    zips: [
      ["11201", "11205", "11206"],
      ["11217", "11238", "11216"],
      ["11215", "11225", "11213"],
    ],
  },
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Distance from a point to a shape, 0 when the point is inside. Same units as the input. */
function distanceToShape(ring: number[][], [px, py]: number[]) {
  let inside = false
  let min = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j]
    const [x2, y2] = ring[i]
    const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
    const t = len2 ? clamp01(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2) : 0
    min = Math.min(min, Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))))
    if (y1 > py !== y2 > py && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1) inside = !inside
  }
  return inside ? 0 : min
}

/** Route numbers count up per ZIP code across all locations, so every route id is unique. */
const zipCounters: Record<string, number> = {}

function buildLocation(place: Location, index: number) {
  const rnd = mulberry32(7 + index * 101)
  const [lng0, lat0] = place.center
  const kmPerLng = 111.32 * Math.cos((lat0 * Math.PI) / 180)
  const toLngLat = ([x, y]: number[]): [number, number] => [
    lng0 + (x - AREA_W / 2) / kmPerLng,
    lat0 - (y - AREA_H / 2) / 110.574,
  ]

  // A jittered grid of seed points, relaxed twice, gives cells that look like neighbourhoods.
  let seeds: [number, number][] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      seeds.push([
        ((c + 0.5 + (rnd() - 0.5) * 0.9) * AREA_W) / COLS,
        ((r + 0.5 + (rnd() - 0.5) * 0.9) * AREA_H) / ROWS,
      ])
  const cells = () => Delaunay.from(seeds).voronoi([0, 0, AREA_W, AREA_H])
  const centre = (ring: number[][]): [number, number] => [
    ring.reduce((s, p) => s + p[0], 0) / ring.length,
    ring.reduce((s, p) => s + p[1], 0) / ring.length,
  ]
  for (let i = 0; i < 2; i++) {
    const v = cells()
    seeds = seeds.map((_, n) => centre(v.cellPolygon(n).slice(1)))
  }

  const voronoi = cells()
  const routes: Route[] = seeds.map((_, n) => {
    const ring = voronoi.cellPolygon(n).slice(1)
    const [x, y] = centre(ring)
    const nx = x / AREA_W
    const ny = y / AREA_H
    const zip = place.zips[Math.min(2, Math.floor(ny * 3))][Math.min(2, Math.floor(nx * 3))]
    zipCounters[zip] = (zipCounters[zip] ?? 0) + 1
    const code = `C${String(zipCounters[zip]).padStart(3, "0")}`
    const [cx, cy] = toLngLat([x, y])
    return {
      id: `${zip}-${code}`,
      location: place.id,
      zip,
      code,
      residences: 280 + Math.round(rnd() * 560),
      reach: distanceToShape(ring, [AREA_W / 2, AREA_H / 2]) / KM_PER_MILE,
      points: ring.map(toLngLat),
      cx,
      cy,
      nx,
      ny,
      order: 0,
      audience: {},
    }
  })

  // Order used when splitting: a west-to-east sweep, so each wave is one block of neighbouring routes.
  routes
    .slice()
    .sort((a, b) => Math.round(a.nx * 24) - Math.round(b.nx * 24) || a.ny - b.ny)
    .forEach((rt, i) => (rt.order = index * 1000 + i))

  // Placeholder demographics: they change smoothly over the area, so matching routes form groups.
  for (const rt of routes) {
    const west = 1 - rt.nx
    const north = 1 - rt.ny
    const central = 1 - clamp01(Math.hypot(rt.nx - 0.5, rt.ny - 0.5) / 0.6)
    const signal: Record<string, number> = {
      age: 0.2 + 0.6 * (1 - central),
      gender: 0.5,
      income: (west + north) / 2,
      household: 0.2 + 0.6 * (1 - central),
      education: (west + central) / 2,
      ownership: 0.3 + 0.4 * central,
      insurance: 0.75 - (west + north) / 2,
    }
    for (const cat of AUDIENCE) {
      const n = cat.options.length
      if (cat.ordered) {
        const i = Math.max(0, Math.min(n - 2, Math.round((signal[cat.id] + (rnd() - 0.5) * 0.9) * (n - 1))))
        rt.audience[cat.id] = [cat.options[i], cat.options[i + 1]]
      } else {
        rt.audience[cat.id] = [cat.options[signal[cat.id] + (rnd() - 0.5) * 1.1 > 0.5 ? 1 : 0]]
      }
    }
  }

  return { location: place, routes }
}

const BUILT = PLACES.map(buildLocation)
/** Suggested places, shown before the user types. */
export const LOCATIONS = BUILT.map((b) => b.location)
export const LOCATION_BY_ID: Record<string, Location> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l])
)

/** Routes of every location loaded so far. A campaign can have routes in more than one location. */
export const ROUTES: Route[] = BUILT.flatMap((b) => b.routes)
export const ROUTE_BY_ID: Record<string, Route> = Object.fromEntries(ROUTES.map((r) => [r.id, r]))

/** Loads a place the user searched for: generates its routes the first time, then reuses them. */
let built = PLACES.length
export function addLocation(place: Location): Location {
  const known = LOCATION_BY_ID[place.id]
  if (known) return known
  const { routes } = buildLocation(place, built++)
  LOCATION_BY_ID[place.id] = place
  ROUTES.push(...routes)
  for (const r of routes) ROUTE_BY_ID[r.id] = r
  return place
}

/* --------------------------------------------------------------- pricing */

/** Placeholder quantity table. Replace with the real EDDM price table. */
export const PRICE_TIERS = [
  { min: 25000, price: 0.34 },
  { min: 10000, price: 0.37 },
  { min: 5000, price: 0.41 },
  { min: 2500, price: 0.47 },
  { min: 1000, price: 0.56 },
]
export const WAVE_MINIMUM = 1000

export function pricePerPiece(quantity: number) {
  for (const tier of PRICE_TIERS) if (quantity >= tier.min) return tier.price
  return PRICE_TIERS[PRICE_TIERS.length - 1].price
}

/* ----------------------------------------------------------------- dates */

export const TODAY = startOfDay(new Date())
export const MIN_DATE = addBusinessDays(TODAY, 7)
export const MAX_DATE = addDays(TODAY, 360)

export function nextWeekday(d: Date) {
  let out = d
  while (isWeekend(out)) out = addDays(out, 1)
  return out
}

export const fmtDate = (d: Date | null, pattern = "EEE, MMM d, yyyy") =>
  d ? format(d, pattern) : "No date"
export const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" })
export const fmtNum = (n: number) => n.toLocaleString("en-US")

/* ----------------------------------------------------------------- waves */

/** `color` is fixed when the wave is created, so a wave keeps its colour when dates reorder the list. */
export type Wave = { id: string; date: Date | null; color: number }
/** routeId -> the waves that mail it. A route can be in several waves; it is mailed once per wave. */
export type Assignment = Record<string, string[]>

export type WaveIssue = { kind: "minimum" | "date" | "duplicate" | "early"; text: string }

export type WaveView = {
  wave: Wave
  index: number
  color: string
  routes: Route[]
  residences: number
  price: number
  subtotal: number
  issues: WaveIssue[]
}

export const WAVE_COLORS = [
  "var(--wave-1)",
  "var(--wave-2)",
  "var(--wave-3)",
  "var(--wave-4)",
  "var(--wave-5)",
  "var(--wave-6)",
  "var(--wave-7)",
  "var(--wave-8)",
]
export const MAX_WAVES = WAVE_COLORS.length

let uid = 0
export const newWaveId = () => `w${++uid}`

/** Waves are always shown in mailing order; undated waves go last. */
export function sortWaves(waves: Wave[]) {
  return waves
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      if (a.w.date && b.w.date) return a.w.date.getTime() - b.w.date.getTime() || a.i - b.i
      if (a.w.date) return -1
      if (b.w.date) return 1
      return a.i - b.i
    })
    .map((x) => x.w)
}

export function buildWaveViews(waves: Wave[], assignment: Assignment): WaveView[] {
  const sorted = sortWaves(waves)
  return sorted.map((wave, index) => {
    const routes = ROUTES.filter((r) => assignment[r.id]?.includes(wave.id)).sort(
      (a, b) => a.order - b.order
    )
    const residences = routes.reduce((s, r) => s + r.residences, 0)
    const price = pricePerPiece(residences)
    const issues: WaveIssue[] = []
    if (routes.length > 0 && residences < WAVE_MINIMUM)
      issues.push({
        kind: "minimum",
        text: `Add ${fmtNum(WAVE_MINIMUM - residences)} more residences. Each mailing needs at least ${fmtNum(WAVE_MINIMUM)}.`,
      })
    if (routes.length === 0 && sorted.length > 1)
      issues.push({ kind: "minimum", text: "No routes yet. Add routes or remove this wave." })
    if (!wave.date) {
      if (routes.length > 0 || sorted.length > 1)
        issues.push({ kind: "date", text: "Choose a mailing date." })
    }
    else if (sorted.some((o) => o.id !== wave.id && o.date && isSameDay(o.date, wave.date!)))
      issues.push({ kind: "duplicate", text: "Another wave already mails on this date." })
    else if (wave.date < MIN_DATE)
      issues.push({
        kind: "early",
        text: `The first mailing must be on or after ${fmtDate(MIN_DATE, "MMM d")}.`,
      })
    return {
      wave,
      index,
      color: WAVE_COLORS[wave.color % WAVE_COLORS.length],
      routes,
      residences,
      price,
      subtotal: residences * price,
      issues,
    }
  })
}

/**
 * Split routes into `count` waves of similar size, sweeping west to east so
 * neighbouring routes land in the same wave.
 */
export function splitRoutes(routeIds: string[], count: number): string[][] {
  const routes = routeIds.map((id) => ROUTE_BY_ID[id]).sort((a, b) => a.order - b.order)
  const total = routes.reduce((s, r) => s + r.residences, 0)
  const groups: string[][] = Array.from({ length: count }, () => [])
  let acc = 0
  let g = 0
  routes.forEach((r, i) => {
    const remainingRoutes = routes.length - i
    const remainingGroups = count - g
    // Move to the next wave once this one reached its share, keeping one route for each remaining wave.
    if (
      g < count - 1 &&
      groups[g].length > 0 &&
      (acc + r.residences / 2 > (total * (g + 1)) / count || remainingRoutes < remainingGroups)
    )
      g++
    groups[g].push(r.id)
    acc += r.residences
  })
  return groups
}

export function scheduleDates(first: Date, count: number, everyWeeks: number) {
  return Array.from({ length: count }, (_, i) => nextWeekday(addDays(first, i * everyWeeks * 7)))
}

export function quote(groups: string[][]) {
  return groups.map((ids) => {
    const residences = ids.reduce((s, id) => s + ROUTE_BY_ID[id].residences, 0)
    const price = pricePerPiece(residences)
    return { routes: ids.length, residences, price, subtotal: residences * price }
  })
}
