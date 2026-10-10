# Green Home Twin: web app

Mobile-first client for the Green Home Twin. It is built with Next.js 16 (App Router, Cache Components), Tailwind v4, shadcn/ui, React Three Fiber, Better Auth (email + password), Prisma 7 and Postgres.

## Run it

```sh
bun install                      # also runs `prisma generate`
cp .env.example .env             # then fill BETTER_AUTH_SECRET (openssl rand -base64 32)
podman run -d --name ght-postgres -e POSTGRES_USER=ght -e POSTGRES_PASSWORD=ght -e POSTGRES_DB=ght \
  -p 5432:5432 -v ght-pg:/var/lib/postgresql/data docker.io/library/postgres:17-alpine
# or: docker compose up -d   (compose.yaml)
bunx prisma migrate dev          # creates tables (restart `bun run dev` after a migration: the dev server caches the Prisma client)
bun run db:postcodes ../data/raw/postcodes/postcodes.csv   # 48k postcodes from our dataset, or onspd_trimmed.csv for all 1.8M UK ones
bun run db:buildings "M14 4AJ" "BS6 5AB"                   # optional: pre-fetch OSM buildings for demo postcodes
bun run dev                      # http://localhost:3000, open with phone-sized devtools
bun test src                     # unit tests (footprint geometry)
```

Set `ENGINE_URL` to the Python engine to replace the preview numbers (see "Engine contract" below).

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing page with the auto-rotating twin, cycling between normal and thermal views |
| `/sign-up`, `/sign-in` | Email + password (Better Auth) |
| `/new` | Free-form capture: describe the home, take or upload photos, add a floor plan, dictate by voice, add an optional postcode. With a postcode, "Find on map" opens a 3D model of the street (OSM footprints) where the user taps their home; its footprint suggests built form, storeys and roof. The analysis then builds the house part by part from what was found, highlighting the supporting words in the user's text. The review walks through Shape, Walls, Roof, Windows, Heating and Power like a character creator: the camera flies to each part, the rest of the house fades, cutaways show wall and loft insulation and glazing panes, and amber hotspots mark parts with guesses |
| `/home` | Twin hero (drag to orbit, Home/Thermal toggle), score ring, where-heat-goes bars (tap one to fly the camera there), stats, performance gap, key issues, next step, score breakdown |
| `/plan` | Ordered retrofit plan; the Today/After plan toggle animates the solar panels and heat pump into place and cools the thermal view; per-fuel savings (negative = increase), carbon, value range |
| `/ask` | Voice-first "talk to your house" (Web Speech API dictation). The reply is a placeholder until the LLM layer is wired |
| `/energy`, `/you` | Energy tiles; profile, homes, share status, memory placeholder, sign out |
| `/t/[slug]` | Public "twin card" (share from `/home`): holographic house that tilts with the phone or pointer, live score from the engine, no address or postcode |

## Where things live

Pages are server components. Client code is limited to the interactive pieces (3D stage, toggles, forms, chat), and a component used by a single route lives next to that route.

```
src/app/(auth)/actions.ts            signIn / signUp server functions (Better Auth + nextCookies)
src/app/(flow)/new/actions.ts        createHome (multipart capture) and confirmHome server functions
src/app/(flow)/new/*.tsx             capture flow, analysing view, review step, on-device photo downscaling
src/app/(app)/home|plan/page.tsx     server-rendered content; *-stage.tsx is the only client part
src/app/(app)/ask/actions.ts         askHome server function (placeholder until the LLM layer lands)
src/app/(app)/you/actions.ts         signOut server function
src/app/api/uploads/[id]             owner-only file serving for <img src> (files in ./storage, gitignored)
src/components/twin/                 shared 3D: house.tsx, scene.tsx, twin-canvas.tsx (WebGL fallback,
                                     pause when hidden), twin-view.tsx (view state + FocusButton)
src/lib/twin/types.ts                TwinState: the frontend <-> engine contract
src/lib/engine.ts                    getTwin(home): calls ENGINE_URL/twin or falls back to the mock
src/lib/extract/                     typed record fields + Extractor interface (swap in Jev / omni models)
src/lib/geo/                         postcodes (Postgres), OSM buildings via Overpass (cached in BuildingCache),
                                     footprint maths: size, bearing, shared walls -> built form
src/app/(flow)/new/steps.ts          the review steps / build order shared by analysis and review
src/app/t/[slug]/                    public twin card, holographic scene, OG image
scripts/                             import-postcodes.ts, prewarm-buildings.ts
prisma/schema.prisma                 auth models + Home, HomeInput, Extraction, Scenario, ChatMessage, MemoryEvent
```

## 3D performance rules

- The canvas renders on demand. It only runs continuously while auto-rotating or in thermal view, and it stops while off-screen, covered by the sheet, or in a background tab.
- There are no shadow maps; a single contact shadow is baked when the house shape changes. DPR is capped at 1.75 and drops to 1 if the frame rate falls, and bloom is switched off at the same point.
- There is one material per house part, not one per mesh. The vignette is CSS.
- Don't put `backdrop-filter` over the canvas: the browser would re-blur it every frame.
- If WebGL is unavailable or the context is lost, a static fallback replaces the canvas.

## Engine contract

`POST {ENGINE_URL}/twin` with `{ homeId, record, scenario? }` returns a `TwinState` (see `types.ts`). The UI never calculates a score, saving, carbon or value figure itself. The 3D house takes its geometry from the confirmed record, and its thermal colours come from `heatLoss` shares.

## Data sources in the app

- Postcodes: ONS Postcode Directory (via postcodes.io / ONS Open Geography Portal), Open Government Licence v3. Imported into the `Postcode` table, so lookups never leave our database.
- Buildings: OpenStreetMap via the Overpass API, ODbL. The map shows "© OpenStreetMap contributors". Results are cached per postcode for 30 days.
- EPC data is used only to train the model, never shown in the app (address fields carry Royal Mail / OS copyright, and showing training rows would blur evaluation).

## Notes

- Prisma 7: the client is generated into `src/generated/prisma` (gitignored) and uses the `@prisma/adapter-pg` driver adapter. The config is in `prisma.config.ts`.
- `bunx auth@latest generate` rewrites `prisma/schema.prisma` and drops the app models; re-add them if you run it.
- Cache Components is on: anything that reads the session must sit inside `<Suspense>` (see `app/(app)/*/page.tsx`).
- `src/proxy.ts` only redirects based on whether the session cookie exists. Pages and API routes still verify the session.
