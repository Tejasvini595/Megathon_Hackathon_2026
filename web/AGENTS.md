<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Green Home Twin (web)

Mobile-first client for our hackathon entry (Problem Statement: Green Home Score and Retrofit Recommendation Engine). A user describes their home in any form (photos, text, floor plan, voice), Jev / omni models plus an LLM extract a structured record, the user checks and corrects it, and the app shows a 3D "twin" with the home's score, where heat is lost, a retrofit plan, savings and value, and lets them ask what-if questions.

## Goals

- Make home energy data feel tangible: a Tesla-app-grade, dark, animated UI built around the 3D twin.
- Never force a postcode or a form-first flow; free-form capture, then a confirm step.
- **Core rule (non-negotiable):** the UI and the LLM never compute scores, savings, carbon or value figures. These come from the Python engine (`ENGINE_URL`, `TwinState` in `src/lib/twin/types.ts`); what-ifs re-run the engine and the LLM only explains the outputs. The mock in `src/lib/twin/mock.ts` is a clearly labelled fallback.

## Stack

Next.js 16 (App Router, Cache Components, server functions), React 19, Tailwind v4 + shadcn, React Three Fiber, Better Auth (email/password), Prisma 7 + Postgres. Use `bun`. Libraries are newer than most training data: check the bundled docs before using an API.

## Code quality

- Pages are server components; mark only the interactive leaf as `"use client"`.
- Mutations and data loading go through server functions / server components, not `fetch` to our own API routes. Validate input with zod and re-check the session in every action.
- A component used by one route lives in that route's folder; `src/components` is for shared code only.
- Session reads sit inside `<Suspense>` (Cache Components).
- 3D must stay cheap: on-demand frame loop, no shadow maps, shared materials, pause when hidden, friendly fallback when WebGL is missing (see the README's performance rules).
- Match the surrounding style: small files, few comments that explain why, no dead code. `bun run typecheck` and `bun run lint` must pass.
- Commits: no Claude co-author trailer, never push, never commit datasets or `.env`.
