import * as React from "react"
import { addDays } from "date-fns"
import { toast } from "sonner"
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleQuestionMark,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Circle,
  Home,
  Info,
  LayoutGrid,
  Mail,
  Expand,
  Minus,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  X,
  MapPin,
  Merge,
  Split,
  Trash2,
  Users,
  Workflow,
} from "lucide-react"
import { cn } from "cn"

import { DatePicker } from "@/components/date-picker"
import { IconButton } from "@/components/icon-button"
import { MAP_PILL, RouteMap, type MapTools } from "@/components/route-map"
import { searchPlaces } from "@/lib/geocode"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Toaster } from "@/components/ui/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AUDIENCE,
  LOCATIONS,
  LOCATION_BY_ID,
  MAX_WAVES,
  MIN_DATE,
  PRICE_TIERS,
  RADIUS,
  ROUTES,
  WAVE_MINIMUM,
  addLocation,
  buildWaveViews,
  countFilters,
  fitsAudience,
  fmtDate,
  fmtMoney,
  fmtNum,
  newWaveId,
  ROUTE_BY_ID,
  nextWeekday,
  pricePerPiece,
  quote,
  scheduleDates,
  splitRoutes,
  type Assignment,
  type AudienceFilters,
  type Location,
  type Route,
  type Wave,
  type WaveView,
} from "@/lib/eddm"

/* ------------------------------------------------------------------ state */

type State = { waves: Wave[]; assignment: Assignment }

/** Value of the wave picker when a click on a route applies to every wave. */
const ALL_WAVES = "all"

const SPRING_START = nextWeekday(new Date(2027, 2, 1))
const firstDate = SPRING_START > MIN_DATE ? SPRING_START : MIN_DATE

function demoRoutes() {
  // A contiguous block north of the river, like a real service area.
  // The routes closest to the centre of Richmond.
  return ROUTES.filter((r) => r.location === "richmond" && r.reach <= 0.55).map((r) => r.id)
}

function makeState(groups: string[][], dates: (Date | null)[]): State {
  const waves = groups.map((_, i) => ({ id: newWaveId(), date: dates[i] ?? null, color: i }))
  const assignment: Assignment = {}
  groups.forEach((ids, i) => ids.forEach((id) => (assignment[id] = [...(assignment[id] ?? []), waves[i].id])))
  return { waves, assignment }
}

const PRESETS = {
  empty: { label: "Empty", build: () => makeState([[]], [null]) },
  single: { label: "1 wave", build: () => makeState([demoRoutes()], [firstDate]) },
  waves: {
    label: "3 waves",
    build: () => makeState(splitRoutes(demoRoutes(), 3), scheduleDates(firstDate, 3, 1)),
  },
  repeat: {
    // The same routes mailed twice, 18 days apart.
    label: "Repeat",
    build: () => makeState([demoRoutes(), demoRoutes()], [firstDate, nextWeekday(addDays(firstDate, 18))]),
  },
  issues: {
    label: "Needs fixing",
    build: () => {
      const [a, b, c] = splitRoutes(demoRoutes(), 3)
      const moved = c.slice(0, c.length - 1)
      return makeState([a, [...b, ...moved], c.slice(-1)], [firstDate, addDays(firstDate, 7), null])
    },
  },
} satisfies Record<string, { label: string; build: () => State }>
type PresetKey = keyof typeof PRESETS

/* -------------------------------------------------------------------- app */

export function App() {
  const [preset, setPreset] = React.useState<PresetKey>("empty")
  // Every change goes through setState, so undo and redo cover routes, waves and dates.
  const [history, setHistory] = React.useState(() => ({
    past: [] as State[],
    present: PRESETS.empty.build(),
    future: [] as State[],
  }))
  const state = history.present
  const setState = (update: (s: State) => State) =>
    setHistory((h) => ({
      past: [...h.past.slice(-49), h.present],
      present: update(h.present),
      future: [],
    }))
  const resetState = (next: State) => setHistory({ past: [], present: next, future: [] })
  const [name, setName] = React.useState("EDDM Campaign - 1")
  const [mapOpen, setMapOpen] = React.useState(false)
  /** The route the user asked to see on the map. */
  const [focus, setFocus] = React.useState<{ id: string; key: number }>()
  const [splitOpen, setSplitOpen] = React.useState(false)
  const [activeWave, setActiveWave] = React.useState<string | null>(null)
  const [filters, setFilters] = React.useState<AudienceFilters>({})
  /** Id of the wave the user asked to remove, while the confirmation is open. */
  const [removing, setRemoving] = React.useState<string | null>(null)
  /** The location the map shows. Routes selected in other locations stay in the campaign. */
  const [locationId, setLocationId] = React.useState("richmond")
  const location = LOCATION_BY_ID[locationId]
  /** Routes load up to this many miles from the location. */
  const [radius, setRadius] = React.useState(RADIUS.initial)
  // The map shows the routes inside the radius, and every selected route, so a selection never disappears.
  const loaded = React.useMemo(
    () =>
      ROUTES.filter(
        (r) => (r.location === locationId && r.reach <= radius) || state.assignment[r.id]
      ),
    [locationId, radius, state.assignment]
  )

  const views = React.useMemo(() => buildWaveViews(state.waves, state.assignment), [state])
  const multi = views.length > 1
  const activeId = views.some((v) => v.wave.id === activeWave) ? activeWave! : views[0].wave.id
  /** "All waves" is selected: a click adds a route to every wave, or removes it from every wave. */
  const allActive = activeWave === ALL_WAVES && multi
  const activeKey = allActive ? ALL_WAVES : activeId
  /** The waves that a click on a route changes. */
  const targetIds = allActive ? views.map((v) => v.wave.id) : [activeId]

  const routeIds = Object.keys(state.assignment)
  const usedLocations = Object.values(LOCATION_BY_ID).filter((l) =>
    routeIds.some((id) => ROUTE_BY_ID[id].location === l.id)
  )
  const routeCount = routeIds.length
  /** Residences on the selected routes, each route counted once. */
  const residences = routeIds.reduce((s, id) => s + ROUTE_BY_ID[id].residences, 0)
  /** Pieces printed: a route in three waves counts three times. */
  const pieces = views.reduce((s, v) => s + v.residences, 0)
  const total = views.reduce((s, v) => s + v.subtotal, 0)
  const singleTotal = residences * pricePerPiece(residences)
  const issueCount = views.reduce((s, v) => s + v.issues.length, 0)
  const ready = routeCount > 0 && issueCount === 0

  const colors = React.useMemo(() => {
    const byWave = Object.fromEntries(views.map((v) => [v.wave.id, v.color]))
    return Object.fromEntries(
      Object.entries(state.assignment).map(([r, ids]) => [
        r,
        views.filter((v) => ids.includes(v.wave.id)).map((v) => byWave[v.wave.id]),
      ])
    )
  }, [views, state.assignment])
  const activeLabel = allActive
    ? "all waves"
    : `Wave ${views.findIndex((v) => v.wave.id === activeId) + 1}`
  /** Lower part of the map's hover card: the waves the route is in, then what a click does. */
  const hint = (route: Route) => {
    const ids = state.assignment[route.id] ?? []
    const inWaves = views.filter((v) => ids.includes(v.wave.id))
    // Same rule as the click: the route is removed only when it is in every target wave.
    const removing = ids.length > 0 && targetIds.every((id) => ids.includes(id))
    const target = views.find((v) => v.wave.id === activeId) ?? views[0]
    return (
      <>
        {inWaves.length > 0 && (
          <ul className="flex flex-col gap-1 border-t px-3 py-2">
            {inWaves.map((v) => (
              <li key={v.wave.id} className="flex items-center gap-1.5">
                <WaveDot color={v.color} />
                <span className="font-medium">Wave {v.index + 1}</span>
                <span className="ml-auto pl-4 text-muted-foreground tabular-nums">
                  {fmtDate(v.wave.date, "MMM d")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5 border-t bg-muted/60 px-3 py-1.5 text-muted-foreground">
          {removing ? "Click to remove from" : "Click to add to"}
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            {allActive ? (
              <>
                <WaveDots views={views} /> all waves
              </>
            ) : (
              <>
                <WaveDot color={target.color} /> Wave {target.index + 1}
              </>
            )}
          </span>
        </div>
      </>
    )
  }

  // Audience filters apply to the location on the map.
  const fit = React.useMemo(
    () => loaded.filter((r) => r.location === locationId && fitsAudience(r, filters)),
    [filters, locationId, loaded]
  )
  const fitIds = React.useMemo(() => new Set(fit.map((r) => r.id)), [fit])
  const fitToAdd = fit.filter(
    (r) => !targetIds.every((id) => state.assignment[r.id]?.includes(id))
  )

  /** Adds or removes one route in one wave. A route that is left in no wave is no longer selected. */
  const withRoute = (assignment: Assignment, routeId: string, waveId: string, on: boolean) => {
    const ids = (assignment[routeId] ?? []).filter((id) => id !== waveId)
    if (on) ids.push(waveId)
    const next = { ...assignment }
    if (ids.length) next[routeId] = ids
    else delete next[routeId]
    return next
  }

  const actions = {
    toggleRoute(route: Route) {
      setState((s) => ({
        ...s,
        // The route is removed only when it is in every target wave. If not, it is added to the ones it is missing.
        assignment: (() => {
          const ids = s.assignment[route.id] ?? []
          const on = !targetIds.every((id) => ids.includes(id))
          return targetIds.reduce((a, id) => withRoute(a, route.id, id, on), s.assignment)
        })(),
      }))
    },
    addRoutes(routes: Route[]) {
      setState((s) => ({
        ...s,
        assignment: routes.reduce(
          (a, r) => targetIds.reduce((b, id) => withRoute(b, r.id, id, true), a),
          s.assignment
        ),
      }))
    },
    /** Removes a route from the selected wave, or from every wave when "All waves" is selected. */
    removeFromActive(routeId: string) {
      setState((s) => ({
        ...s,
        assignment: targetIds.reduce((a, id) => withRoute(a, routeId, id, false), s.assignment),
      }))
    },
    setRouteWave(routeId: string, waveId: string, on: boolean) {
      setState((s) => ({ ...s, assignment: withRoute(s.assignment, routeId, waveId, on) }))
    },
    setDate(waveId: string, date: Date) {
      setState((s) => ({
        ...s,
        waves: s.waves.map((w) => (w.id === waveId ? { ...w, date } : w)),
      }))
    },
    addWave() {
      // A new wave mails a week after the last one. If the last wave has no date yet, neither does this one.
      const last = views[views.length - 1].wave.date
      const taken = state.waves.map((w) => w.date?.toDateString())
      let date: Date | null = null
      if (last) {
        date = nextWeekday(addDays(last, 7))
        while (taken.includes(date.toDateString())) date = nextWeekday(addDays(date, 7))
      }
      const used = state.waves.map((w) => w.color)
      const color = Array.from({ length: MAX_WAVES }, (_, n) => n).find((n) => !used.includes(n)) ?? 0
      const wave = { id: newWaveId(), date, color }
      setActiveWave(wave.id)
      setState((s) => ({ ...s, waves: [...s.waves, wave] }))
    },
    /**
     * Shows one route on the map. A wave can have routes in several places and the map shows one
     * place at a time, so this moves the map to the route's place and outlines the route.
     */
    showOnMap(routeId: string) {
      setLocationId(ROUTE_BY_ID[routeId].location)
      setFocus({ id: routeId, key: Date.now() })
      if (!mapOpen)
        document
          .querySelector('[aria-label="Carrier routes map"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
    },
    /** Removes a wave. A wave that has routes asks for confirmation first; an empty one goes at once. */
    removeWave(waveId: string) {
      const view = views.find((v) => v.wave.id === waveId)
      if (view && view.routes.length > 0) setRemoving(waveId)
      else actions.removeWaveNow(waveId)
    },
    removeWaveNow(waveId: string) {
      // The wave's mailings go with it. A route that was only in this wave is no longer selected.
      setState((s) => ({
        waves: s.waves.filter((w) => w.id !== waveId),
        assignment: Object.keys(s.assignment).reduce(
          (a, routeId) => withRoute(a, routeId, waveId, false),
          s.assignment
        ),
      }))
    },
    applySplit(count: number, first: Date, everyWeeks: number) {
      setState((s) =>
        makeState(splitRoutes(Object.keys(s.assignment), count), scheduleDates(first, count, everyWeeks))
      )
      offerUndo(`Routes distributed into ${count} waves.`)
    },
    sendOnOneDate() {
      setState((s) => makeState([Object.keys(s.assignment)], [views[0].wave.date]))
      offerUndo(`${views.length} waves merged into one.`)
    },
  }

  /**
   * These two actions replace every wave at once, so a message offers to take them back.
   * Undo restores the schedule as it was before the action, also if the user changed something after.
   */
  function offerUndo(message: string) {
    const before = state
    toast(message, {
      duration: 10000,
      action: { label: "Undo", onClick: () => setState(() => before) },
    })
  }

  const audience: AudienceProps = {
    filters,
    onChange: setFilters,
    ids: fitIds,
    toAdd: fitToAdd.length,
    activeLabel,
    onAddAll: () => actions.addRoutes(fitToAdd),
  }

  const mapTools: MapTools = {
    routes: loaded,
    focus,
    center: location.center,
    place: location.label,
    radius,
    onRadiusChange: setRadius,
    onAddArea: actions.addRoutes,
    onUndo: () =>
      setHistory((h) =>
        h.past.length
          ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
          : h
      ),
    onRedo: () =>
      setHistory((h) =>
        h.future.length
          ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
          : h
      ),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-svh bg-muted/40 text-sm">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Stepper />
          <main className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-8">
            <h1 className="mb-6 font-heading text-xl font-semibold tracking-tight">
              New EDDM Campaign
            </h1>
            <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
              <div className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Details</CardTitle>
                    <CardDescription>Start by setting a name for your campaign.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Label htmlFor="name">Campaign name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </CardContent>
                </Card>

                <TargetingCard
                  colors={colors}
                  hint={hint}
                  tools={mapTools}
                  audience={audience}
                  location={location}
                  onLocationChange={setLocationId}
                  views={views}
                  activeId={activeKey}
                  onActiveChange={setActiveWave}
                  onAddWave={actions.addWave}
                  onRemoveWave={actions.removeWave}
                  routeCount={routeCount}
                  residences={residences}
                  pieces={pieces}
                  onToggle={actions.toggleRoute}
                  onOpenMap={() => setMapOpen(true)}
                />

                <ScheduleCard
                  views={views}
                  residences={residences}
                  extraCost={pieces === residences ? total - singleTotal : 0}
                  actions={actions}
                  onSplit={() => setSplitOpen(true)}
                  onOpenMap={(waveId) => {
                    setActiveWave(waveId)
                    setMapOpen(true)
                  }}
                />
              </div>

              <SummaryCard
                name={name}
                locations={usedLocations.length ? usedLocations : [location]}
                views={views}
                routeCount={routeCount}
                residences={residences}
                pieces={pieces}
                total={total}
                issueCount={issueCount}
                ready={ready}
              />
            </div>
          </main>
        </div>

        <MapDialog
          open={mapOpen}
          onOpenChange={setMapOpen}
          views={views}
          colors={colors}
          hint={hint}
          tools={mapTools}
          audience={audience}
          location={location}
          onLocationChange={setLocationId}
          activeId={activeKey}
          onActiveChange={setActiveWave}
          onAddWave={actions.addWave}
          onRemoveWave={actions.removeWave}
          onToggle={actions.toggleRoute}
          onRemove={actions.removeFromActive}
          onShow={actions.showOnMap}
        />
        <SplitDialog
          key={String(splitOpen)}
          open={splitOpen}
          onOpenChange={setSplitOpen}
          routeIds={Object.keys(state.assignment)}
          residences={residences}
          initialCount={multi ? views.length : 3}
          initialDate={views[0].wave.date ?? firstDate}
          singleTotal={singleTotal}
          onApply={actions.applySplit}
        />

        <RemoveWaveDialog
          view={views.find((v) => v.wave.id === removing)}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            if (removing) actions.removeWaveNow(removing)
            setRemoving(null)
          }}
        />

        <Toaster position="bottom-center" />

        <div className="fixed bottom-4 left-4 z-40 flex w-52 flex-col gap-1.5 rounded-lg border border-dashed bg-background p-2.5 shadow-sm">
          <span className="text-xs font-medium text-muted-foreground">Prototype state</span>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <Button
                key={key}
                size="xs"
                variant={preset === key ? "secondary" : "ghost"}
                aria-pressed={preset === key}
                onClick={() => {
                  setPreset(key)
                  resetState(PRESETS[key].build())
                }}
              >
                {PRESETS[key].label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

/** Confirmation for removing a wave that has routes. It says what is lost, in numbers. */
function RemoveWaveDialog({
  view,
  onCancel,
  onConfirm,
}: {
  view: WaveView | undefined
  onCancel: () => void
  onConfirm: () => void
}) {
  // Keep the last wave while the dialog closes, so its text does not go blank during the animation.
  const last = React.useRef(view)
  if (view) last.current = view
  const shown = view ?? last.current
  const routes = shown?.routes.length ?? 0
  return (
    <AlertDialog open={Boolean(view)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Wave {(shown?.index ?? 0) + 1}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its {fmtNum(routes)} {routes === 1 ? "route" : "routes"} will not be mailed
            {shown?.wave.date ? ` on ${fmtDate(shown.wave.date, "MMM d")}` : ""}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove wave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type Actions = {
  toggleRoute: (route: Route) => void
  setRouteWave: (routeId: string, waveId: string, on: boolean) => void
  showOnMap: (routeId: string) => void
  setDate: (waveId: string, date: Date) => void
  addWave: () => void
  removeWave: (waveId: string) => void
  applySplit: (count: number, first: Date, everyWeeks: number) => void
  sendOnOneDate: () => void
}

/* ------------------------------------------------------------------ shell */

const NAV = [
  { icon: Home, label: "Home" },
  { icon: LayoutGrid, label: "Recent campaigns" },
  { icon: BarChart3, label: "Analytics" },
  { section: "Channels" },
  { icon: Mail, label: "Direct Mail" },
  { label: "Every Door Direct Mail", sub: true, active: true },
  { label: "Addressed Direct Mail", sub: true },
  { icon: Workflow, label: "Workflows" },
  { section: "Resources" },
  { icon: Users, label: "Audiences" },
  { icon: Settings, label: "Settings" },
] as const

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-0.5 border-r bg-background p-3 lg:flex">
      <div className="mb-3 flex h-10 items-center px-2 text-lg font-semibold tracking-tight text-primary">
        oppizi
      </div>
      {NAV.map((item, i) =>
        "section" in item ? (
          <div key={i} className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground uppercase">
            {item.section}
          </div>
        ) : (
          <a
            key={i}
            href="#"
            aria-current={"active" in item ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium hover:bg-muted",
              "sub" in item && "pl-9 font-normal text-muted-foreground",
              "active" in item && "bg-muted text-foreground"
            )}
          >
            {"icon" in item && <item.icon className="size-4" />}
            {item.label}
          </a>
        )
      )}
    </aside>
  )
}

function Stepper() {
  const steps = [
    { label: "Targeting", icon: CircleDot, current: true },
    { label: "Design", icon: Circle },
    { label: "Tracking", icon: Circle },
  ]
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-center gap-4 border-b bg-background">
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          {i > 0 && <span className="h-px w-8 bg-border" />}
          <span
            aria-current={step.current ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 font-medium",
              !step.current && "text-muted-foreground"
            )}
          >
            <step.icon className="size-4" />
            {step.label}
          </span>
        </React.Fragment>
      ))}
    </header>
  )
}

/* -------------------------------------------------------------- targeting */

/** Picks the wave that map clicks add routes to. Waves can be added and removed from the same list. */
function WaveSelect({
  views,
  activeId,
  onActiveChange,
  onAddWave,
  onRemoveWave,
  className,
}: {
  views: WaveView[]
  activeId: string
  onActiveChange: (id: string) => void
  onAddWave: () => void
  onRemoveWave: (id: string) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const all = activeId === ALL_WAVES
  const active = views.find((v) => v.wave.id === activeId) ?? views[0]
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg bg-background p-1 shadow-sm ring-1 ring-foreground/10",
        className
      )}
    >
      <span className="px-1.5 text-xs whitespace-nowrap text-muted-foreground">Add routes to</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Add routes to ${all ? "all waves" : `Wave ${active.index + 1}`}. Change wave`}
              className="min-w-28 flex-1 justify-between font-normal"
            />
          }
        >
          <span className="flex items-center gap-1.5">
            {all ? (
              <>
                <WaveDots views={views} /> All waves
              </>
            ) : (
              <>
                <WaveDot color={active.color} /> Wave {active.index + 1}
              </>
            )}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-1 p-1">
          <ul className="flex flex-col" aria-label="Waves">
            {views.length > 1 && (
              <li className="flex items-center gap-0.5">
                <button
                  aria-current={all || undefined}
                  onClick={() => {
                    onActiveChange(ALL_WAVES)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    all && "bg-muted font-medium"
                  )}
                >
                  <WaveDots views={views} />
                  <span className="whitespace-nowrap">All waves</span>
                  <span className="flex-1 truncate pl-1 text-xs font-normal text-muted-foreground">
                    Add to each wave
                  </span>
                  {all && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            )}
            {/* "All waves" is a different kind of choice from one wave, so a divider sets it apart. */}
            {views.length > 1 && <li role="separator" className="my-1 h-px bg-border" />}
            {views.map((v) => {
              const current = !all && v.wave.id === active.wave.id
              return (
                <li key={v.wave.id} className="flex items-center gap-0.5">
                  <button
                    aria-current={current || undefined}
                    onClick={() => {
                      onActiveChange(v.wave.id)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      current && "bg-muted font-medium"
                    )}
                  >
                    <WaveDot color={v.color} />
                    <span className="whitespace-nowrap">Wave {v.index + 1}</span>
                    <span className="flex-1 truncate pl-1 text-xs font-normal text-muted-foreground tabular-nums">
                      {fmtDate(v.wave.date, "MMM d")} · {fmtNum(v.residences)} residences
                    </span>
                    {current && <Check className="size-3.5 shrink-0" />}
                  </button>
                  <IconButton
                    variant="ghost"
                    size="icon-sm"
                    disabled={views.length === 1}
                    label={`Remove Wave ${v.index + 1}`}
                    tooltip="Remove wave"
                    side="right"
                    onClick={() => onRemoveWave(v.wave.id)}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              )
            })}
          </ul>
          <Separator />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 justify-start px-2"
            disabled={views.length >= MAX_WAVES}
            onClick={() => {
              onAddWave()
              setOpen(false)
            }}
          >
            <Plus /> Add wave
          </Button>
        </PopoverContent>
      </Popover>
      <Popover>
        <IconButton
          trigger={<PopoverTrigger />}
          variant="ghost"
          size="icon-sm"
          label="What are waves?"
          side="right"
        >
          <CircleQuestionMark />
        </IconButton>
        <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <p className="font-medium">Waves</p>
            <p className="text-muted-foreground">
              A wave is a group of routes with one mailing date.
            </p>
          </div>
          <ol className="flex flex-col gap-2.5 border-t px-3.5 py-3">
            {["Select a wave.", "Click a route to add it. Click it again to remove it."].map(
              (step, i) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              )
            )}
          </ol>
          <p className="flex items-baseline justify-between gap-4 border-t px-3.5 py-2.5 whitespace-nowrap">
            <span className="text-muted-foreground">Wave minimum</span>
            <span className="font-medium tabular-nums">{fmtNum(WAVE_MINIMUM)} residences</span>
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}

type AudienceProps = {
  filters: AudienceFilters
  onChange: (filters: AudienceFilters) => void
  /** Ids of the routes that fit the filters */
  ids: Set<string>
  /** How many of them are not in the selected wave yet */
  toAdd: number
  activeLabel: string
  onAddAll: () => void
}

/** Marker for a route that fits the filters. Same as the one on the map. */
function FitDot() {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full bg-foreground" />
}

/** "18 routes fit" */
const fitText = (n: number) => `${n} ${n === 1 ? "route fits" : "routes fit"}`

/**
 * Sits on top of the map: the Audience filters button next to `children`. It opens the filters
 * panel. The badge shows how many filters are set.
 */
function AudienceButton({
  audience,
  open,
  onOpenChange,
  side = "left",
  children,
}: {
  audience: AudienceProps
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Corner of the map it sits in */
  side?: "left" | "right"
  children?: React.ReactNode
}) {
  const count = countFilters(audience.filters)
  // On the right, the open panel covers this corner and has its own title and close button.
  if (side === "right" && open) return null
  return (
    <div
      className={cn(
        "absolute top-3 flex flex-col gap-1.5",
        side === "left" ? "left-3 items-start" : "right-3 items-end"
      )}
    >
      <div className="flex items-center gap-1.5">
        {children}
        <div className={MAP_PILL}>
          <Button
            variant={open ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            <SlidersHorizontal /> Audience filters
            {count > 0 && (
              <Badge className="h-4.5 min-w-4.5 px-1 tabular-nums" aria-label={`${count} selected`}>
                {count}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The filters panel. It sits inside the map, on the right, and stays open while the user clicks routes. */
function AudiencePanel({ audience, onClose }: { audience: AudienceProps; onClose: () => void }) {
  const { filters, onChange, ids, toAdd, activeLabel, onAddAll } = audience
  const count = countFilters(filters)
  const toggle = (categoryId: string, option: string) => {
    const list = filters[categoryId] ?? []
    onChange({
      ...filters,
      [categoryId]: list.includes(option) ? list.filter((o) => o !== option) : [...list, option],
    })
  }
  return (
    <section aria-label="Audience filters" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5 py-2.5 pr-2 pl-3.5">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Audience filters</h3>
          {/* No tooltip: an X that closes a panel needs no explanation. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close filters"
            className="ml-auto"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <p className="pr-1.5 text-xs text-muted-foreground">
          Select the people you want to reach. The map marks the routes that fit.
        </p>
      </div>
      <Separator />
      <ScrollArea className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 p-3.5">
          {AUDIENCE.map((cat) => (
            <div key={cat.id} role="group" aria-labelledby={`aud-${cat.id}`} className="flex flex-col gap-2">
              <span id={`aud-${cat.id}`} className="text-xs font-medium">
                {cat.label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {cat.options.map((option) => {
                  const on = Boolean(filters[cat.id]?.includes(option))
                  return (
                    <Button
                      key={option}
                      size="xs"
                      variant="outline"
                      aria-pressed={on}
                      className={cn(
                        "rounded-full font-normal tabular-nums",
                        on &&
                          "border-foreground bg-foreground text-background hover:bg-foreground/85 hover:text-background"
                      )}
                      onClick={() => toggle(cat.id, option)}
                    >
                      {option}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex min-h-7 items-center justify-between gap-2 pl-1">
          {count === 0 ? (
            <span className="text-muted-foreground">No filters selected</span>
          ) : ids.size === 0 ? (
            <span className="text-muted-foreground">No routes fit these filters</span>
          ) : (
            <span className="flex items-center gap-2 tabular-nums" aria-live="polite">
              <FitDot /> {fitText(ids.size)}
            </span>
          )}
          <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => onChange({})}>
            Clear filters
          </Button>
        </div>
        <Button variant="outline" size="sm" disabled={toAdd === 0} onClick={onAddAll}>
          {toAdd > 0
            ? `Add ${toAdd} to ${activeLabel}`
            : ids.size > 0
              ? `Already in ${activeLabel}`
              : `Add to ${activeLabel}`}
        </Button>
      </div>
    </section>
  )
}

/** How far from the searched place routes load. Sits inside the search field: "Richmond, VA | Within 1 mi". */
function RadiusSelect({ tools }: { tools: MapTools }) {
  const { radius, onRadiusChange, place } = tools
  return (
    <Popover>
      <PopoverTrigger
        render={
          <InputGroupButton
            className="gap-1 px-2 font-normal whitespace-nowrap text-foreground tabular-nums"
            aria-label={`Routes within ${radius} mi of ${place}. Change radius`}
          />
        }
      >
        Within {radius} mi <ChevronDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-64 gap-3 p-3.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span id="search-radius" className="font-medium">
              Radius
            </span>
            <span className="tabular-nums">{radius} mi</span>
          </div>
          <p className="text-muted-foreground">
            The map shows the routes in this distance from {place}.
          </p>
        </div>
        <Slider
          aria-labelledby="search-radius"
          min={RADIUS.min}
          max={RADIUS.max}
          step={RADIUS.step}
          value={[radius]}
          onValueChange={(v) => onRadiusChange(Array.isArray(v) ? v[0] : v)}
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{RADIUS.min} mi</span>
          <span>{RADIUS.max} mi</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Search box for the place to mail around: an address, a business, a landmark, a city or a ZIP code.
 * Results come from a place-search service as the user types. Choosing one moves the map there.
 */
function LocationSearch({
  id,
  location,
  onChange,
  trailing,
  className,
  groupClassName,
}: {
  id?: string
  location: Location
  onChange: (locationId: string) => void
  /** Shown inside the field, after a divider (the radius control) */
  trailing?: React.ReactNode
  className?: string
  groupClassName?: string
}) {
  const [text, setText] = React.useState(location.label)
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const [results, setResults] = React.useState<Location[]>([])
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">("idle")
  const listId = React.useId()
  // Two search boxes (page and map dialog) show the same location.
  React.useEffect(() => setText(location.label), [location])

  const q = text.trim()
  // Before the user types something new, the list shows a few suggested places.
  const searching = q.length >= 3 && q !== location.label
  React.useEffect(() => {
    if (!searching) {
      setStatus("idle")
      return
    }
    setStatus("loading")
    const controller = new AbortController()
    // Wait for a pause in typing, then search. A newer search cancels this one.
    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then((places) => {
          setResults(places)
          setIndex(0)
          setStatus("idle")
        })
        .catch((error) => {
          if (error.name !== "AbortError") setStatus("error")
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, searching])

  const matches = searching ? results : LOCATIONS
  const pick = (place: Location) => {
    onChange(addLocation(place).id)
    setText(place.label)
    setOpen(false)
  }

  return (
    <div className={cn(!className?.includes("absolute") && "relative", className)}>
      <InputGroup className={groupClassName}>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {trailing && (
          <InputGroupAddon align="inline-end" className="gap-1 self-stretch py-0">
            {/* Full-height divider, same colour as the field's border */}
            <span aria-hidden className="w-px self-stretch bg-input" />
            {trailing}
          </InputGroupAddon>
        )}
        <InputGroupInput
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search an address, a place or a ZIP code"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setIndex(0)
            setOpen(true)
          }}
          onFocus={(e) => {
            setOpen(true)
            e.target.select()
          }}
          onBlur={() => {
            setOpen(false)
            setText(location.label)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault()
              setOpen(true)
              const step = e.key === "ArrowDown" ? 1 : -1
              setIndex((i) => (i + step + matches.length) % Math.max(1, matches.length))
            } else if (e.key === "Enter" && open && matches[index]) {
              e.preventDefault()
              pick(matches[index])
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
        />
      </InputGroup>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 flex w-full flex-col rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {!searching && (
            <li role="presentation" className="px-2 pt-1 pb-0.5 text-xs text-muted-foreground">
              Suggested
            </li>
          )}
          {searching && status === "error" ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              Search is not available. Check your connection and try again.
            </li>
          ) : searching && status === "loading" && results.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
          ) : matches.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              No place found. Try a different address, place or ZIP code.
            </li>
          ) : (
            matches.map((place, i) => (
              <li
                key={place.id}
                role="option"
                aria-selected={i === index}
                // mousedown, so the choice is made before the input loses focus
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(place)
                  ;(document.activeElement as HTMLElement | null)?.blur()
                }}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  "flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1",
                  i === index && "bg-muted",
                  status === "loading" && "opacity-60"
                )}
              >
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{place.label}</span>
                  {place.detail && (
                    <span className="truncate text-xs text-muted-foreground">{place.detail}</span>
                  )}
                </span>
                {place.id === location.id && <Check className="ml-auto size-3.5 shrink-0" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

function TargetingCard({
  colors,
  hint,
  tools,
  audience,
  location,
  onLocationChange,
  views,
  activeId,
  onActiveChange,
  onAddWave,
  onRemoveWave,
  routeCount,
  residences,
  pieces,
  onToggle,
  onOpenMap,
}: {
  colors: Record<string, string[]>
  hint: (route: Route) => React.ReactNode
  tools: MapTools
  audience: AudienceProps
  location: Location
  onLocationChange: (locationId: string) => void
  views: WaveView[]
  activeId: string
  onActiveChange: (id: string) => void
  onAddWave: () => void
  onRemoveWave: (id: string) => void
  routeCount: number
  residences: number
  pieces: number
  onToggle: (route: Route) => void
  onOpenMap: () => void
}) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>Targeting</CardTitle>
        <CardDescription>
          Choose the carrier routes to mail. Every residence on a selected route gets a piece.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city">Address or place</Label>
          <LocationSearch
            id="city"
            location={location}
            onChange={onLocationChange}
            trailing={<RadiusSelect tools={tools} />}
          />
        </div>
        <RouteMap
          colors={colors}
          hint={hint}
          onToggle={onToggle}
          highlight={audience.ids}
          scrollZoom={false}
          {...tools}
          className="h-96"
          sidePanel={
            filtersOpen && <AudiencePanel audience={audience} onClose={() => setFiltersOpen(false)} />
          }
          viewControl={
            <div className={MAP_PILL}>
              <IconButton variant="ghost" size="icon-sm" label="Open map" side="left" onClick={onOpenMap}>
                <Expand />
              </IconButton>
            </div>
          }
        >
          <WaveSelect
            views={views}
            activeId={activeId}
            onActiveChange={onActiveChange}
            onAddWave={onAddWave}
            onRemoveWave={onRemoveWave}
            className="absolute top-3 left-3"
          />
          <AudienceButton
            audience={audience}
            side="right"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
          />
        </RouteMap>
        <div className="flex items-center justify-between">
          {routeCount === 0 ? (
            <span className="text-muted-foreground">
              No routes selected. Click a route on the map to add it to Wave 1.
            </span>
          ) : (
            <span>
              <span className="font-medium tabular-nums">{fmtNum(routeCount)}</span>{" "}
              {routeCount === 1 ? "route" : "routes"}
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="font-medium tabular-nums">{fmtNum(residences)}</span> residences
              {pieces !== residences && (
                <>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="font-medium tabular-nums">{fmtNum(pieces)}</span> pieces
                </>
              )}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MapDialog({
  open,
  onOpenChange,
  views,
  colors,
  hint,
  tools,
  audience,
  location,
  onLocationChange,
  activeId,
  onActiveChange,
  onAddWave,
  onRemoveWave,
  onToggle,
  onRemove,
  onShow,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  views: WaveView[]
  colors: Record<string, string[]>
  hint: (route: Route) => React.ReactNode
  tools: MapTools
  audience: AudienceProps
  location: Location
  onLocationChange: (locationId: string) => void
  activeId: string
  onActiveChange: (id: string) => void
  onAddWave: () => void
  onRemoveWave: (id: string) => void
  onToggle: (route: Route) => void
  onRemove: (routeId: string) => void
  onShow: (routeId: string) => void
}) {
  const all = activeId === ALL_WAVES
  const active = views.find((v) => v.wave.id === activeId) ?? views[0]
  // With "All waves" selected, the list shows every selected route once.
  const listed = all
    ? [...new Set(views.flatMap((v) => v.routes))].sort((a, b) => a.order - b.order)
    : active.routes
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(780px,calc(100svh-3rem))] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[min(1240px,calc(100%-3rem))]">
        <DialogHeader>
          <DialogTitle>Routes in {location.label}</DialogTitle>
          <DialogDescription>
            Choose a wave, then click routes on the map to add them to it. A route can be in more
            than one wave. Click a route that is already in this wave to remove it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-4">
          <ScrollArea className="flex min-h-0 flex-col rounded-lg border">
          <div className="flex flex-col gap-3 p-3">
            <WaveSelect
              views={views}
              activeId={activeId}
              onActiveChange={onActiveChange}
              onAddWave={onAddWave}
              onRemoveWave={onRemoveWave}
              className="p-0 shadow-none ring-0"
            />
            {all ? (
              <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                {views.length} waves · {fmtNum(views.reduce((n, v) => n + v.residences, 0))} pieces
              </p>
            ) : (
              // Progress to the wave minimum, as a neutral bar and not as an error. In its own box.
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-lg leading-none font-semibold tracking-tight tabular-nums">
                      {fmtNum(active.residences)}
                    </span>
                    <span className="text-xs text-muted-foreground">residences</span>
                  </span>
                  <span className="flex items-center gap-1 self-center text-xs whitespace-nowrap text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    {fmtDate(active.wave.date, "EEE, MMM d")}
                  </span>
                </div>
                {/* The bar stays when the minimum is reached: it is then full. */}
                <MinimumBar view={active} />
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  {active.residences < WAVE_MINIMUM ? (
                    <span>
                      <span className="font-medium text-foreground tabular-nums">
                        {fmtNum(WAVE_MINIMUM - active.residences)}
                      </span>{" "}
                      more to reach the minimum
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Check className="size-3.5 text-emerald-600" /> Minimum reached
                    </span>
                  )}
                  <span className="whitespace-nowrap tabular-nums">Min. {fmtNum(WAVE_MINIMUM)}</span>
                </div>
              </div>
            )}
            <span className="pt-1 text-xs font-medium text-muted-foreground">
              {all ? "Selected routes" : `Wave ${active.index + 1} routes`} ({listed.length})
            </span>
            {listed.length === 0 ? (
              <p className="text-muted-foreground">No routes yet. Click routes on the map.</p>
            ) : (
              <ul className="flex flex-col">
                {listed.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 border-b py-1.5 last:border-0">
                    <button
                      className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      title="Show on map"
                      onClick={() => onShow(r.id)}
                    >
                      {r.id}
                    </button>
                    <OtherWaves route={r} view={all ? undefined : active} views={views} />
                    <span className="text-muted-foreground tabular-nums">
                      {fmtNum(r.residences)}
                    </span>
                    <IconButton
                      variant="ghost"
                      size="icon-xs"
                      label={`Remove route ${r.id}`}
                      tooltip={all ? "Remove from all waves" : "Remove route"}
                      side="right"
                      onClick={() => onRemove(r.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </ScrollArea>
          <RouteMap
            colors={colors}
            hint={hint}
            onToggle={onToggle}
            highlight={audience.ids}
            {...tools}
            className="min-h-0"
            sidePanel={
              filtersOpen && <AudiencePanel audience={audience} onClose={() => setFiltersOpen(false)} />
            }
          >
            <LocationSearch
              location={location}
              onChange={onLocationChange}
              className="absolute top-3 left-3 w-96"
              groupClassName="h-9 bg-background shadow-sm"
              trailing={<RadiusSelect tools={tools} />}
            />
            <AudienceButton
              audience={audience}
              side="right"
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
            />
          </RouteMap>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------------- schedule */

function WaveDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

/** Dots for the other waves that also mail this route. Without `view`, dots for every wave that mails it. */
function OtherWaves({ route, view, views }: { route: Route; view?: WaveView; views: WaveView[] }) {
  const also = views.filter((v) => v !== view && v.routes.includes(route))
  const text = `${view ? "Also in" : "In"} Wave ${also.map((v) => v.index + 1).join(", ")}`
  return (
    <span className="flex flex-1 items-center gap-1" title={also.length ? text : undefined}>
      {also.map((v) => (
        <WaveDot key={v.wave.id} color={v.color} />
      ))}
      {also.length > 0 && <span className="sr-only">{text}</span>}
    </span>
  )
}

/** One overlapping dot per wave: the mark for "All waves". */
function WaveDots({ views }: { views: WaveView[] }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1">
      {views.slice(0, 4).map((v) => (
        <span
          key={v.wave.id}
          className="size-2.5 rounded-full ring-1 ring-background"
          style={{ backgroundColor: v.color }}
        />
      ))}
    </span>
  )
}

function PriceTable() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className="inline-flex rounded-sm align-middle text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Price per piece by quantity"
          />
        }
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="block w-52 p-3">
        <div className="mb-1.5 font-medium">Price per piece, by mailing size</div>
        {[...PRICE_TIERS].reverse().map((t) => (
          <div key={t.min} className="flex justify-between tabular-nums">
            <span>{fmtNum(t.min)}+ residences</span>
            <span>{fmtMoney(t.price)}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

function ScheduleCard({
  views,
  residences,
  extraCost,
  actions,
  onSplit,
  onOpenMap,
}: {
  views: WaveView[]
  residences: number
  extraCost: number
  actions: Actions
  onSplit: () => void
  onOpenMap: (waveId: string) => void
}) {
  const multi = views.length > 1
  const canSplit = residences >= WAVE_MINIMUM * 2

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailing schedule</CardTitle>
        <CardDescription>
          Each wave is printed and mailed on its own date, and priced on its own size. Add a wave to
          mail routes on another date.
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <IconButton trigger={<DropdownMenuTrigger />} variant="outline" size="icon" label="Schedule options">
              <MoreHorizontal />
            </IconButton>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={!canSplit} onClick={onSplit}>
                <Split /> Distribute routes evenly…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!multi} onClick={actions.sendOnOneDate}>
                <Merge /> Merge into one wave
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {views.map((v) => (
            <WaveRow
              key={v.wave.id}
              view={v}
              views={views}
              actions={actions}
              onOpenMap={() => onOpenMap(v.wave.id)}
            />
          ))}
        </ul>
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={views.length >= MAX_WAVES}
            onClick={actions.addWave}
          >
            <Plus /> Add wave
          </Button>
          {multi && extraCost > 0.005 && (
            <p className="text-right text-xs text-muted-foreground">
              Waves add {fmtMoney(extraCost)} compared with one mailing. Smaller print runs cost
              more per piece. <PriceTable />
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Progress of a wave toward the minimum, in the wave's colour. It is full when the minimum is reached. */
function MinimumBar({ view, className }: { view: WaveView; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Residences toward the wave minimum"
      aria-valuemin={0}
      aria-valuemax={WAVE_MINIMUM}
      aria-valuenow={Math.min(view.residences, WAVE_MINIMUM)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-foreground/10", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${Math.min(1, view.residences / WAVE_MINIMUM) * 100}%`,
          backgroundColor: view.color,
        }}
      />
    </div>
  )
}

/** Problems the user must correct: a date that another wave uses, or one that is too early. */
function IssueList({ view }: { view: WaveView }) {
  const issues = view.issues.filter((issue) => issue.kind === "duplicate" || issue.kind === "early")
  if (issues.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((issue) => (
        <li key={issue.kind} className="flex items-start gap-1.5 text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {issue.text}
        </li>
      ))}
    </ul>
  )
}

function WaveRow({
  view,
  views,
  actions,
  onOpenMap,
}: {
  view: WaveView
  views: WaveView[]
  actions: Actions
  onOpenMap: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const others = views.filter((v) => v.wave.id !== view.wave.id)
  const taken = others.flatMap((v) => (v.wave.date ? [v.wave.date] : []))
  const hasIssues = view.issues.length > 0
  // Only a wrong date is an error. Too few residences and a missing date are things still to do.
  const hasErrors = view.issues.some((i) => i.kind === "duplicate" || i.kind === "early")
  // Shown from 0, also for a new, empty wave.
  const below = view.residences < WAVE_MINIMUM
  const title = `Wave ${view.index + 1}`
  // The table names each route's place when the campaign has routes in more than one.
  const multiPlace = new Set(views.flatMap((v) => v.routes.map((r) => r.location))).size > 1

  return (
    <li data-wave-issue={hasIssues || undefined}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("rounded-lg border", hasErrors && "border-destructive/50")}
      >
        {/* Name, progress, date and price sit the same distance apart. */}
        <div className="flex items-center gap-6 p-2.5">
          <CollapsibleTrigger
            render={
              <button
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`${title}, ${open ? "hide" : "show"} routes`}
              />
            }
          >
            <ChevronRight
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            />
            <WaveDot color={view.color} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                {title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {view.routes.length} {view.routes.length === 1 ? "route" : "routes"}
              </span>
            </span>
          </CollapsibleTrigger>

          {/* Progress to the minimum: a small bar with no error colour. It stays, full, once the minimum is reached. */}
          <div className="flex w-52 shrink-0 flex-col gap-1.5">
            {/* "Min." names the target as a minimum. "823 / 1,000" reads like a limit. */}
            <span className="flex items-center justify-between gap-3 text-xs leading-4 whitespace-nowrap text-muted-foreground tabular-nums">
              <span>
                <span className="font-medium text-foreground">{fmtNum(view.residences)}</span>{" "}
                residences
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {!below && <Check className="size-3 text-emerald-600" aria-label="Minimum reached" />}
                Min. {fmtNum(WAVE_MINIMUM)}
              </span>
            </span>
            <MinimumBar view={view} className="h-1" />
          </div>

          <DatePicker
            value={view.wave.date}
            onChange={(d) => actions.setDate(view.wave.id, d)}
            taken={taken}
            invalid={hasErrors}
            className="w-40 gap-1.5 px-2.5"
          />

          <div className="w-28 shrink-0 tabular-nums">
            <div className="font-medium">{fmtMoney(view.subtotal)}</div>
            <div className="text-xs text-muted-foreground">
              {fmtNum(view.residences)} × {fmtMoney(view.price)}
            </div>
          </div>

          <DropdownMenu>
            <IconButton
              trigger={<DropdownMenuTrigger />}
              variant="ghost"
              size="icon-sm"
              label={`${title} options`}
              tooltip="Wave options"
            >
              <MoreHorizontal />
            </IconButton>
            <DropdownMenuContent align="end" className="w-auto min-w-48 whitespace-nowrap">
              <DropdownMenuItem onClick={onOpenMap}>
                <MapPin /> Choose routes on the map
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={others.length === 0}
                onClick={() => actions.removeWave(view.wave.id)}
              >
                <Trash2 /> Remove wave
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {hasErrors && (
          <div className="border-t border-destructive/30 bg-destructive/5 px-3 py-2">
            <IssueList view={view} />
          </div>
        )}

        <CollapsibleContent>
          <div className="border-t">
            {view.routes.length === 0 ? (
              <p className="flex items-center justify-between gap-3 px-3 py-3 text-muted-foreground">
                No routes in this wave yet.
                <Button variant="outline" size="xs" onClick={onOpenMap}>
                  <MapPin /> Choose routes
                </Button>
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-3">Route</TableHead>
                    {multiPlace && <TableHead>Location</TableHead>}
                    <TableHead>ZIP code</TableHead>
                    <TableHead className="text-right">Residences</TableHead>
                    <TableHead className="w-12 pr-3 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.routes.map((r) => {
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="pl-3">
                          <span className="flex items-center gap-2">
                            {/* The route number is a link to the route on the map. */}
                            <button
                              className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                              title="Show on map"
                              onClick={() => actions.showOnMap(r.id)}
                            >
                              {r.id}
                            </button>
                          </span>
                        </TableCell>
                        {multiPlace && (
                          <TableCell className="max-w-40 truncate text-muted-foreground">
                            {LOCATION_BY_ID[r.location]?.label}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground tabular-nums">{r.zip}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNum(r.residences)}
                        </TableCell>
                        <TableCell className="py-1 pr-3 text-right">
                          <DropdownMenu>
                            <IconButton
                              trigger={<DropdownMenuTrigger />}
                              variant="ghost"
                              size="icon-xs"
                              label={`Route ${r.id} options`}
                              tooltip="Route options"
                              side="left"
                            >
                              <MoreHorizontal />
                            </IconButton>
                            <DropdownMenuContent align="end" className="w-auto min-w-52 whitespace-nowrap">
                              <DropdownMenuItem onClick={() => actions.showOnMap(r.id)}>
                                <MapPin /> Show on map
                              </DropdownMenuItem>
                              {others.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuGroup>
                                    <DropdownMenuLabel>Mail in</DropdownMenuLabel>
                                    {views.map((o) => (
                                      <DropdownMenuCheckboxItem
                                        key={o.wave.id}
                                        checked={o.routes.includes(r)}
                                        onCheckedChange={(on) =>
                                          actions.setRouteWave(r.id, o.wave.id, on)
                                        }
                                      >
                                        <WaveDot color={o.color} />
                                        Wave {o.index + 1}
                                        <span className="pl-1 text-xs text-muted-foreground">
                                          {fmtDate(o.wave.date, "MMM d")}
                                        </span>
                                      </DropdownMenuCheckboxItem>
                                    ))}
                                  </DropdownMenuGroup>
                                </>
                              )}
                              {/* With several waves, unticking a wave above removes the route from it. */}
                              {others.length === 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => actions.setRouteWave(r.id, view.wave.id, false)}
                                  >
                                    <Trash2 /> Remove route
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function SplitDialog({
  open,
  onOpenChange,
  routeIds,
  residences,
  initialCount,
  initialDate,
  singleTotal,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeIds: string[]
  residences: number
  initialCount: number
  initialDate: Date
  singleTotal: number
  onApply: (count: number, first: Date, everyWeeks: number) => void
}) {
  const maxCount = Math.max(2, Math.min(MAX_WAVES, Math.floor(residences / WAVE_MINIMUM), routeIds.length))
  const [count, setCount] = React.useState(Math.min(initialCount, maxCount))
  const [first, setFirst] = React.useState(initialDate)
  const [weeks, setWeeks] = React.useState("1")

  const groups = React.useMemo(() => splitRoutes(routeIds, count), [routeIds, count])
  const rows = quote(groups)
  const dates = scheduleDates(first, count, Number(weeks))
  const total = rows.reduce((s, r) => s + r.subtotal, 0)
  const belowMin = rows.some((r) => r.residences < WAVE_MINIMUM)
  const cadences = [
    { value: "1", label: "Every week" },
    { value: "2", label: "Every 2 weeks" },
    { value: "3", label: "Every 3 weeks" },
    { value: "4", label: "Every 4 weeks" },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Distribute routes evenly</DialogTitle>
          <DialogDescription>
            This replaces your current waves. Each route goes into one wave. Waves get a similar
            size and keep neighbouring routes together. You can still change any route afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
          <div className="flex flex-col gap-2">
            <Label id="count-label">Waves</Label>
            <div className="flex items-center gap-1" role="group" aria-labelledby="count-label">
              <IconButton
                variant="outline"
                size="icon"
                label="Fewer waves"
                disabled={count <= 2}
                onClick={() => setCount(count - 1)}
              >
                <Minus />
              </IconButton>
              <span className="w-7 text-center font-medium tabular-nums" aria-live="polite">
                {count}
              </span>
              <IconButton
                variant="outline"
                size="icon"
                label="More waves"
                disabled={count >= maxCount}
                onClick={() => setCount(count + 1)}
              >
                <Plus />
              </IconButton>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="first-date">First mailing</Label>
            <DatePicker id="first-date" value={first} onChange={setFirst} className="w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cadence">Then</Label>
            <Select items={cadences} value={weeks} onValueChange={(v) => v && setWeeks(v)}>
              <SelectTrigger id="cadence" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cadences.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-3">Wave</TableHead>
                <TableHead>Mails on</TableHead>
                <TableHead className="text-right">Residences</TableHead>
                <TableHead className="text-right">Per piece</TableHead>
                <TableHead className="pr-3 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-3 font-medium">Wave {i + 1}</TableCell>
                  <TableCell className="tabular-nums">{fmtDate(dates[i], "EEE, MMM d")}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      r.residences < WAVE_MINIMUM && "text-destructive"
                    )}
                  >
                    {fmtNum(r.residences)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(r.price)}</TableCell>
                  <TableCell className="pr-3 text-right tabular-nums">
                    {fmtMoney(r.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">
            {total - singleTotal > 0.005
              ? `${fmtMoney(total - singleTotal)} more than mailing on one date`
              : "Same price as mailing on one date"}
          </span>
          <span className="font-medium tabular-nums">Total {fmtMoney(total)}</span>
        </div>
        {belowMin && (
          <p className="flex items-start gap-1.5 text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            Each wave needs at least {fmtNum(WAVE_MINIMUM)} residences. Use fewer waves or add
            routes.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={belowMin}
            onClick={() => {
              onApply(count, first, Number(weeks))
              onOpenChange(false)
            }}
          >
            Distribute into {count} waves
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- summary */

function SummaryCard({
  name,
  locations,
  views,
  routeCount,
  residences,
  pieces,
  total,
  issueCount,
  ready,
}: {
  name: string
  locations: Location[]
  views: WaveView[]
  routeCount: number
  residences: number
  pieces: number
  total: number
  issueCount: number
  ready: boolean
}) {
  const multi = views.length > 1
  const pending = <span className="text-muted-foreground">Pending</span>
  const rows: [string, React.ReactNode][] = [
    ["Campaign name", name || pending],
    [locations.length > 1 ? "Locations" : "Location", locations.map((l) => l.label).join(" · ")],
    ["Routes", routeCount ? fmtNum(routeCount) : pending],
    ["Residences", routeCount ? fmtNum(residences) : pending],
    multi
      ? ["Waves", views.length]
      : ["Mailing date", views[0].wave.date ? fmtDate(views[0].wave.date, "MMM d, yyyy") : pending],
  ]
  if (pieces !== residences) rows.splice(4, 0, ["Pieces", fmtNum(pieces)])
  if (!multi && routeCount)
    rows.push(["Price per piece", fmtMoney(views[0].price)])

  return (
    <Card className="sticky top-20 max-h-[calc(100svh-9.75rem)]">
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{fmtMoney(total)}</div>
          <div className="text-xs text-muted-foreground">
            Total before taxes for {fmtNum(pieces)} pieces
          </div>
        </div>
        <Separator />
        {/* Only this part scrolls when the window is short; total and action stay in view. */}
        <ScrollArea className="-mr-3 flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 pr-3">
          <dl className="flex flex-col gap-2.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate text-right font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {multi && (
            <>
              <Separator />
              <ul className="flex flex-col gap-2">
                {views.map((v) => (
                  <li
                    key={v.wave.id}
                    className="flex items-center gap-2"
                    title={`${fmtNum(v.residences)} residences × ${fmtMoney(v.price)}`}
                  >
                    <WaveDot color={v.color} />
                    <span className="font-medium whitespace-nowrap">Wave {v.index + 1}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {fmtDate(v.wave.date, "MMM d")}
                    </span>
                    {v.issues.length > 0 && (
                      <CircleAlert className="size-3.5 text-destructive" aria-label="Needs fixing" />
                    )}
                    <span className="font-medium tabular-nums">{fmtMoney(v.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        </ScrollArea>

        <Separator />
        {issueCount > 0 && routeCount > 0 ? (
          // Works like a form's error summary: it takes the user to the first wave that needs fixing.
          <button
            className="group self-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-destructive/30"
            onClick={() => {
              const row = document.querySelector<HTMLElement>("[data-wave-issue]")
              row?.scrollIntoView({ behavior: "smooth", block: "center" })
              row?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true })
            }}
          >
            <Badge variant="destructive" className="cursor-pointer group-hover:bg-destructive/20">
              <CircleAlert /> {issueCount} {issueCount === 1 ? "thing" : "things"} to fix in the
              schedule
              <ChevronRight />
            </Badge>
          </button>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <Check className="size-3.5 text-emerald-600" /> Campaign saved
          </div>
        )}
        <Button size="lg" className="h-10 w-full shrink-0" disabled={!ready}>
          Continue to Design
        </Button>
      </CardContent>
    </Card>
  )
}

export default App
