import type { Location } from "@/lib/eddm"

/**
 * Place search for the location field: addresses, businesses, landmarks, cities and ZIP codes.
 * It calls Photon (photon.komoot.io), a free search service on OpenStreetMap data. The text the
 * user types is sent to that service. A production version would use the product's own geocoder.
 */
const ENDPOINT = "https://photon.komoot.io/api/"
/** Rough box around the contiguous United States; EDDM is a USPS service. */
const US_BOX = "-125,24,-66,50"

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    housenumber?: string
    street?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
    countrycode?: string
    /** Kind of result: "house", "street", "locality", "district", "city", "county", "state", "other" */
    type?: string
  }
}

/** A 3 x 3 grid of ZIP codes around the place's own one. Placeholder, like the route shapes. */
function zipsAround(postcode: string | undefined, [lng, lat]: [number, number]) {
  const base = Number.parseInt(postcode ?? "", 10) || Math.abs(Math.round(lat * 997 + lng * 131)) % 90000 + 10000
  const zip = (n: number) => String(Math.max(1, base + n)).padStart(5, "0")
  return [
    [zip(-4), zip(-3), zip(-2)],
    [zip(-1), zip(0), zip(1)],
    [zip(2), zip(3), zip(4)],
  ]
}

/** USPS abbreviations. The search service gives the state as a full name. */
const STATE_CODES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY",
  Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Location[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=8&lang=en&bbox=${US_BOX}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Place search failed: ${response.status}`)
  const data = (await response.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  return data.features
    .filter((f) => f.properties.countrycode === "US")
    .map((f) => {
      const p = f.properties
      const address = [p.housenumber, p.street].filter(Boolean).join(" ")
      // "NY", as in "Richmond, VA". An unknown name stays as it is.
      const state = p.state ? (STATE_CODES[p.state] ?? p.state) : undefined
      const title = p.name ?? (address || p.city || p.postcode || "Unnamed place")
      const detail = [p.name ? address : "", p.city !== title ? p.city : "", state, p.postcode]
        .filter(Boolean)
        .join(", ")
      // A result that is itself a city has no "city" field: its name is the city.
      const isArea = ["city", "locality", "district", "county"].includes(p.type ?? "")
      const cityName = p.type === "state" ? undefined : (p.city ?? (isArea ? p.name : p.county) ?? p.name)
      const center = f.geometry.coordinates
      return {
        id: `place-${center[1].toFixed(5)},${center[0].toFixed(5)}`,
        label: title,
        detail,
        city: cityName ? [cityName, state].filter(Boolean).join(", ") : undefined,
        center,
        zips: zipsAround(p.postcode, center),
      }
    })
    .filter((place) => {
      const key = `${place.label}|${place.detail}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
}
