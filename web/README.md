# Green Home Twin: web app

Mobile-first client for the Green Home Twin. It is built with Next.js 16 (App Router, Cache Components), Tailwind v4, shadcn/ui, React Three Fiber, Better Auth (email + password), Prisma 7 and Postgres.

## Run it

```sh
bun install                      # also runs `prisma generate`
cp .env.example .env             # then fill BETTER_AUTH_SECRET (openssl rand -base64 32)
podman run -d --name ght-postgres -e POSTGRES_USER=ght -e POSTGRES_PASSWORD=ght -e POSTGRES_DB=ght \
  -p 5432:5432 -v ght-pg:/var/lib/postgresql/data docker.io/library/postgres:17-alpine
# or: docker compose up -d   (compose.yaml)
bunx prisma migrate dev          # creates tables
bun run dev                      # http://localhost:3000, open with phone-sized devtools
```

Set `ENGINE_URL` to the Python engine to replace the preview numbers (see "Engine contract" below).

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing page with the auto-rotating twin, cycling between normal and thermal views |
| `/sign-up`, `/sign-in` | Email + password (Better Auth) |
| `/new` | Free-form capture: describe the home, take or upload photos, add a floor plan, dictate by voice, add an optional postcode. Then an analysis animation, then the review screen: every extracted field shows its confidence (Sure / Likely / Guess) and source, can be edited, and the 3D preview updates live |
| `/home` | Twin hero (drag to orbit, Home/Thermal toggle), score ring, where-heat-goes bars (tap one to fly the camera there), stats, performance gap, key issues, next step, score breakdown |
| `/plan` | Ordered retrofit plan; the Today/After plan toggle animates the solar panels and heat pump into place and cools the thermal view; per-fuel savings (negative = increase), carbon, value range |
| `/ask` | Voice-first "talk to your house" (Web Speech API dictation). The reply is a placeholder until the LLM layer is wired |
| `/energy`, `/you` | Energy tiles; profile, homes, memory placeholder, sign out |

## Where things live

```
src/lib/twin/types.ts        TwinState: the frontend <-> engine contract (all numbers come from the engine)
src/lib/twin/mock.ts         P10001-shaped preview data used when ENGINE_URL is unset
src/lib/engine.ts            getTwin(home): calls ENGINE_URL/twin or falls back to the mock
src/lib/extract/fields.ts    The typed property record (categories every decision model must answer in)
src/lib/extract/index.ts     Extractor interface + rules baseline. Swap in Jev / omni decision models here
src/components/twin/         Procedural 3D house (house.tsx) and scene, camera, bloom (scene.tsx)
src/app/api/homes            POST capture (multipart), PATCH confirm record
src/app/api/uploads/[id]     Owner-only file serving (files in ./storage, gitignored)
prisma/schema.prisma         Auth models + Home, HomeInput, Extraction, Scenario, ChatMessage, MemoryEvent
```

## Engine contract

`POST {ENGINE_URL}/twin` with `{ homeId, record, scenario? }` returns a `TwinState` (see `types.ts`). The UI never calculates a score, saving, carbon or value figure itself. The 3D house takes its geometry from the confirmed record, and its thermal colours come from `heatLoss` shares.

## Notes

- Prisma 7: the client is generated into `src/generated/prisma` (gitignored) and uses the `@prisma/adapter-pg` driver adapter. The config is in `prisma.config.ts`.
- `bunx auth@latest generate` rewrites `prisma/schema.prisma` and drops the app models; re-add them if you run it.
- Cache Components is on: anything that reads the session must sit inside `<Suspense>` (see `app/(app)/*/page.tsx`).
- `src/proxy.ts` only redirects based on whether the session cookie exists. Pages and API routes still verify the session.
