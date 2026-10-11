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
bun run db:seed                 # demo user demo@ght.dev / demo12345 with three confirmed homes (idempotent)
bun run dev                      # http://localhost:3000, open with phone-sized devtools
bun test src                     # unit tests (footprint geometry, eval scoring)
bun run e2e                      # Playwright suite on its own dev server (port 3500, needs the DB; fresh user per test)
bun run eval:extract             # extraction baseline on 32 hand-written descriptions -> src/lib/extract/eval/results.md
```

Set `ENGINE_URL` to the Python engine to replace the preview numbers (see "Engine contract" below).

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing page with the auto-rotating twin, cycling between normal and thermal views |
| `/sign-up`, `/sign-in` | Email + password (Better Auth) |
| `/new` | Free-form capture: describe the home, take or upload photos, add a floor plan, dictate by voice, add an optional postcode. With a postcode, "Find on map" opens a 3D model of the street (OSM footprints) where the user taps their home; its footprint suggests built form, storeys and roof. The analysis then builds the house part by part from what was found, highlighting the supporting words in the user's text. The review walks through Shape, Walls, Roof, Windows, Heating, Power, Usage and Rating like a character creator: the camera flies to each part, the rest of the house fades, cutaways show wall, floor and loft insulation and glazing panes, and amber hotspots mark parts with guesses. Custom controls: an age timeline, loft insulation pictures, the EPC ladder, a thermostat dial and a solar size stepper. Usage takes monthly readings (typed or from a supplier / smart-meter CSV) or yearly totals; the review cannot finish until every applicable required field and usage are filled |
| `/home/[id]` | Twin hero (drag to orbit, Home/Thermal toggle), score ring, where-heat-goes bars (tap one to fly the camera there), stats, performance gap, key issues, next step, score breakdown |
| `/plan/[id]` | Ordered retrofit plan; the Today/After plan toggle animates the solar panels and heat pump into place and cools the thermal view; per-fuel savings (negative = increase), carbon, value range; a monthly-cost illustration (loan repayment against bill saving, optional heat pump grant) with the EPC C check and the first steps of the plan that reach C |
| `/ask/[id]` | Voice-first "talk to your house" (Web Speech API dictation): what-ifs re-run the engine, the LLM explains its numbers |
| `/home`, `/plan`, `/ask`, `/energy` | Redirect to that page for the home the user last opened (`last_home_id` cookie, set by the bottom nav on any `/{section}/[id]` page; falls back to the latest confirmed home). The nav keeps the current home id when switching tabs; another user's id is a 404 |
| `/edit/[id]` | Edit a saved home (or continue a draft) with the same step-by-step review |
| `/energy/[id]`, `/you` | Energy tiles; profile, homes (edit, rename, delete), share status, memory placeholder, sign out |
| `/t/[slug]` | Public "twin card" (share from `/home`): holographic house that tilts with the phone or pointer, live score from the engine, no address or postcode |

## Where things live

Pages are server components. Client code is limited to the interactive pieces (3D stage, toggles, forms, chat), and a component used by a single route lives next to that route.

```
src/app/(auth)/actions.ts            signIn / signUp server functions (Better Auth + nextCookies)
src/app/(flow)/new/actions.ts        createHome (multipart capture) and confirmHome server functions
src/app/(flow)/new/*.tsx             capture flow, analysing view, review step, on-device photo downscaling
src/app/(app)/home|plan/[id]/page.tsx  server-rendered content; *-stage.tsx is the only client part
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

## Snap your energy bill

The Usage step can fill itself from a photo, image or PDF of a bill or annual statement (up to 4 files, 10 MB each). `readBill` (`new/bill-actions.ts`) re-checks the session, validates the upload, and sends the bytes to the vision model (`LLM_VISION_MODEL`) in memory; nothing is stored. The model only transcribes printed periods and consumption (`lib/llm/bill.ts`). Everything that earns trust is deterministic, in `lib/extract/bill-checks.ts`: m³ to kWh (m³ x 1.02264 x calorific value / 3.6), contiguous non-overlapping periods, monthly bills mapped to months, longer periods used only as a yearly total when they cover about 12 months (never split into fake months), the 2% check against a printed yearly total, plausibility ranges, and the same validity rules as typed readings. The user sees each finding (ok, check, reject) and confirms before anything is used. Without `OPENROUTER_API_KEY` the card says bill reading isn't set up.

- `bun run bills:make` regenerates the synthetic test bills in `e2e/fixtures/bills/` (made-up people and numbers, with `truth.json`).
- `bun run eval:bills` runs the checks on the ground truth (no key needed, includes the deliberately inconsistent bill) and, with a key, scores the reader per number.

## 3D performance rules

- The canvas renders on demand. It only runs continuously while auto-rotating or in thermal view, and it stops while off-screen, covered by the sheet, or in a background tab.
- There are no shadow maps; a single contact shadow is baked when the house shape changes. DPR is capped at 1.75 and drops to 1 if the frame rate falls, and bloom is switched off at the same point.
- There is one material per house part, not one per mesh. The vignette is CSS.
- Don't put `backdrop-filter` over the canvas: the browser would re-blur it every frame.
- If WebGL is unavailable or the context is lost, a static fallback replaces the canvas.

## Record notes

- Flats and maisonettes record `flatLevel` (ground / mid / top) and `blockStoreys`; their own `storeys` can be more than 1. Fields that don't apply (e.g. loft insulation for a flat with a home above) are hidden by `when` in `fields.ts`.
- Every field the score needs is required (no "not sure"); only `sapScore`, `thermostatC` and `currentValueGbp` may be null. `epcBand: "unknown"` asks the engine's estimator to fill the rating. Fields that don't apply to the home (`when`) are saved as null.
- `rooms` is bedrooms plus living rooms; text that only gives bedrooms adds one living room at lower confidence. `loftInsulation` is a category (none / thin / some / thick; the 3D loft draws 0 / 50 / 150 / 270 mm for display only). `solarKw` can come from a panel count at `SOLAR_KW_PER_PANEL` = 0.4 kW (`src/lib/extract/solar.ts`); the 3D house draws `round(kW / 0.4)` panels.
- `record.usage` holds metered energy: monthly readings (`YYYY-MM`, kWh) need at least 6 months with electricity (and gas for gas heating) and one December to February month, otherwise yearly totals (`src/lib/extract/usage.ts`). Oil, heat-network and other-fuel amounts are asked for when the heating type needs them.
- `normaliseRecord` migrates records saved before v2 (bedrooms to rooms, loft mm to category, the old age bands, solid walls, one heat pump) and drops `secondaryHeating`.
- `normaliseRecord` fills fields missing from homes saved before a field existed.

## Engine contract

`POST {ENGINE_URL}/twin` with `{ homeId, record, scenario? }` returns a `TwinState` (see `types.ts`). The UI never calculates a score, saving, carbon or value figure itself. The 3D house takes its geometry from the confirmed record, and its thermal colours come from `heatLoss` shares.

## LLMs and decision models

Everything goes through OpenRouter (`OPENROUTER_API_KEY`). Each job's model, thinking level and provider routing are environment variables (`web/.env.example`); defaults are small open-weight models. No LLM ever produces a score, saving, carbon or value figure. Without a key, every job falls back to a deterministic path.

| Job | Default | What it does | Guardrail | Fallback |
|---|---|---|---|---|
| Describe → record (`lib/extract/llm.ts`) | `deepseek/deepseek-v4.1-flash` | Reads typed/spoken descriptions into the record's own answer options | Quotes must appear in the text; confidence from stated vs implied; the user confirms every field | Keyword rules |
| Choice fields with probabilities (`lib/extract/decide-fields.ts`) | `perplexity/pplx-decider-v1.1-27b` (decision model) | A probability for every option of every choice field | Only pre-fills above `DECISION_CONFIDENT`; the review asks the rest by impact | Uniform probabilities (ranking by stakes only) |
| Ask: question → scenario (`lib/llm/ask.ts`) | `deepseek/deepseek-v4.1-flash` | Typed scenario over the 9 catalogue measures | zod enum of measure ids | Engine rules (`/parse`) |
| Ask: memory facts (`lib/llm/memory-notes.ts`) | decision model | Done / ruled out / renting / listed / priority in a message | Suggested only above the threshold; the user confirms | Engine rules (`/memory/parse`) |
| Ask: explanation (`lib/llm/explainer.ts`) | `z-ai/glm-5.3-flash` | Explains the engine's results | No digits: `[[slots]]` only, filled and checked by the engine (`/check`) | Engine template |
| Reading bills | `z-ai/glm-5.3-flash` (vision) | kWh per billing period from a photo/PDF | Arithmetic and plausibility checks decide what's accepted | Manual / CSV entry |

The explanation prompt lives with its checks in `model/greenhome/llm.py` (served by `/llm/prompt`). Evaluation: `bun run eval:llm` (groundedness, factual accuracy, unsupported claims vs the brief's targets, scored by the engine's metrics), `bun run eval:extract [-- --heldout]` (description reading), `bun run eval:decide` (decision models: accuracy, calibration, latency, cost; also sets the threshold).

**Asking only what matters.** The decision model gives a probability for each answer; the engine's `/sensitivity` re-runs the home under each plausible answer and measures how far the score, the recommended plan and the bill saving move. The review asks high-stakes, uncertain questions first, pre-fills confident ones for a one-tap confirm, and groups the rest as quick confirms. Required fields are never filled silently.

## Data sources in the app

- Postcodes: ONS Postcode Directory (via postcodes.io / ONS Open Geography Portal), Open Government Licence v3. Imported into the `Postcode` table, so lookups never leave our database.
- Buildings: OpenStreetMap via the Overpass API, ODbL. The map shows "© OpenStreetMap contributors". Results are cached per postcode for 30 days.
- EPC data is used only to train the model, never shown in the app (address fields carry Royal Mail / OS copyright, and showing training rows would blur evaluation).

## Notes

- Prisma 7: the client is generated into `src/generated/prisma` (gitignored) and uses the `@prisma/adapter-pg` driver adapter. The config is in `prisma.config.ts`.
- `bunx auth@latest generate` rewrites `prisma/schema.prisma` and drops the app models; re-add them if you run it.
- Cache Components is on: anything that reads the session must sit inside `<Suspense>` (see `app/(app)/*/page.tsx`).
- `src/proxy.ts` only redirects based on whether the session cookie exists. Pages and API routes still verify the session.
