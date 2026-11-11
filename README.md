# EDDM waves prototype

A clickable prototype of the Targeting step of the EDDM campaign builder, with **waves**: one
campaign mailed in several drops, each on its own date and priced on its own size.

It is a design prototype, not production code. It does not use the Oppizi design system; it is
built with plain shadcn/ui components.

## Run it

You need Node.js 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open the address the terminal prints (usually http://localhost:5173).

## What to try

- **Prototype state** (bottom left): jump between an empty campaign, one wave, three waves, a
  repeat campaign (the same routes mailed twice) and a campaign that still needs fixing.
- **Address or place**: search a real address, business, city or ZIP code. The map moves there and
  loads routes within the chosen radius.
- **Add routes to**: choose a wave, or "All waves", then click routes on the map. The Area tool
  adds every route under the circle.
- **Route suggestions**: choose an audience, click "Suggest routes", then add the suggested routes
  to a wave.
- **Mailing schedule**: set a date for each wave, see its price, and open a wave to see its routes.

## What is real and what is not

| Part | Status |
| --- | --- |
| Street map and place search | Real (OpenStreetMap data, through OpenFreeMap and Photon) |
| Carrier route shapes, residences per route, ZIP codes on routes | Generated placeholders |
| Audience data per route | Generated placeholders |
| Prices | Placeholder table in `src/lib/eddm.ts`. The price per piece is not shown in the interface. |
| Business rules (1,000 minimum for each wave, weekdays only, 7 business days out, 360 days ahead, no two waves on one date) | Implemented as in the brief |

The map credits are hidden in this prototype. A public version must credit OpenStreetMap and
OpenFreeMap. Text typed in the place search is sent to the Photon search service.

## Where things are

- `src/App.tsx`: the page, the cards, the dialogs.
- `src/components/route-map.tsx`: the map and its tools.
- `src/lib/eddm.ts`: routes, waves, pricing and date rules.
- `src/lib/geocode.ts`: place search.
