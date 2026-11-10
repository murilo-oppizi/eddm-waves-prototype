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
      const title = p.name ?? (address || p.city || p.postcode || "Unnamed place")
      const detail = [p.name ? address : "", p.city !== title ? p.city : "", p.state, p.postcode]
        .filter(Boolean)
        .join(", ")
      const center = f.geometry.coordinates
      return {
        id: `place-${center[1].toFixed(5)},${center[0].toFixed(5)}`,
        label: title,
        detail,
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
