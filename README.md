# The Intelligent Task Orchestrator

A Kanban project manager with AI-assisted task generation, built for the Hinabi Privé Front-End Developer take-home.

**Live demo:** _to be filled after deploy_ — see [`#deploy`](#deploy)

---

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4 · `@base-ui/react` (shadcn flavor) · TanStack Query v5 · `@dnd-kit/core` + `@dnd-kit/sortable` · React Hook Form + Zod v4 · Vercel AI SDK + `@ai-sdk/google` (Gemini 2.5 Flash) · `next-themes` · Framer Motion · Vitest · Playwright · ESLint + Prettier · Vercel.

## Quickstart

```bash
npm install
cp .env.local.example .env.local
# fill in GOOGLE_GENERATIVE_AI_API_KEY (free key at aistudio.google.com)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an API key the app loads and CRUD works; only the "Magic Generate" feature returns an error.

### Environment variables

| Name                           | Required | Purpose                                                                                     |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | yes      | Read by `@ai-sdk/google` for the `/api/ai/generate-tasks` route. Server-only.               |
| `NEXT_PUBLIC_BACKEND`          | no       | `local` (default) selects the localStorage repository. Reserved for a future Supabase swap. |

The only persistent storage is the browser's `localStorage` — there is no database. Reset state by clearing site data.

## Scripts

| Command              | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `npm run dev`        | Next.js dev server on `:3000` (Turbopack).                    |
| `npm run build`      | Production build.                                             |
| `npm start`          | Serve the production build.                                   |
| `npm run lint`       | ESLint (flat config in `eslint.config.mjs`).                  |
| `npm run typecheck`  | `tsc --noEmit` against `tsconfig.json`.                       |
| `npm test`           | Vitest run (25 tests across repositories + AI route handler). |
| `npm run test:watch` | Vitest watch mode.                                            |
| `npm run test:e2e`   | Playwright happy-path spec (chromium, AI route stubbed).      |
| `npm run format`     | Prettier on the whole tree.                                   |

## Architecture

**Repository pattern with a single localStorage implementation.** Data access lives behind `ProjectRepository` and `TaskRepository` interfaces (`src/lib/repositories/types.ts`). The current implementation in `src/lib/repositories/local-storage.ts` serializes the whole collection per entity under versioned keys (`tio:projects`, `tio:tasks`). Every method is `async` and `safeParse`-validates reads — corrupted localStorage degrades to an empty list rather than crashing the app. The factory in `src/lib/repositories/index.ts` picks the implementation by `NEXT_PUBLIC_BACKEND`, so a future `SupabaseProjectRepository` is a one-line swap. Components never touch repositories directly; they go through TanStack Query hooks in `src/hooks/`.

**Optimistic drag-and-drop.** `src/components/kanban/board.tsx` wraps the three columns in a `DndContext` with separate mouse/touch/keyboard sensors (the touch sensor uses a longer activation delay so scrolling on mobile doesn't pick up a card). On drag end, the board takes a snapshot of the pre-drag cache, computes the new order with `arrayMove` over the full column (the active item included on both sides of the index lookup — see `notes/ai-bug.md` for why that detail matters), writes the new order into the query cache immediately, then fires the `reorder` mutation. Errors roll back to the snapshot and surface a toast.

**AI generation pipeline.** The "Magic Generate" dialog posts to `POST /api/ai/generate-tasks` with `{ projectTitle, projectDescription?, context? }`. The route handler Zod-validates the request (`RequestSchema`), calls `generateObject({ model: google('gemini-2.5-flash'), schema: AIResponseSchema, … })` so the output is guaranteed to match an array of exactly 5 categorized tasks, and the client bulk-inserts via `taskRepo.createMany`. A demo-grade in-memory rate limiter (10 req / minute, process-local) sits in front; for real traffic, swap it for Upstash + a real key.

For the full design rationale, see [`docs/plans/2026-05-31-intelligent-task-orchestrator-design.md`](docs/plans/2026-05-31-intelligent-task-orchestrator-design.md). For the task-by-task build order, see [`docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md`](docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md).

## Testing

- **Unit tests (Vitest, 25 passing).** `src/lib/repositories/local-storage.test.ts` covers create / get / update / delete, validates that schema-failing inputs reject, that delete cascades to subtasks, and that corrupted localStorage degrades gracefully. `src/app/api/ai/generate-tasks/route.test.ts` covers request validation, the rate limiter, and the `NoObjectGeneratedError` branch. Run with `npm test`.
- **End-to-end (Playwright, 1 passing).** `tests/e2e/happy-path.spec.ts` drives the full user flow against a stubbed AI route: create project → Magic Generate → drag → edit (with auto-save assertion) → add sub-task → delete project. The stub mirrors `AIResponseSchema` exactly, so the spec is deterministic and doesn't burn the Gemini quota in CI. Real Gemini is only hit when manually testing the live deploy. Run with `npm run test:e2e` — ~7 s on a warm dev server.

## Accessibility

- 0 axe-core violations on `/` and `/projects/:id` in both light and dark mode (verified during Chunk H; default shadcn dark `--primary` was bumped to pass AA contrast — see `notes/ai-bug.md`).
- 44 px minimum touch targets on mobile (`max-sm:min-h-11` / `max-sm:size-11` on every interactive element).
- Keyboard drag-and-drop via dnd-kit's `KeyboardSensor` — tasks are reachable by Tab, picked up with Space, moved with arrow keys, dropped with Space.
- Visible focus rings everywhere (`focus-visible:ring-2 focus-visible:ring-ring`).
- Save indicator announced via `aria-live="polite"` on the task detail panel.

## Known limitations

- **localStorage only.** No multi-device sync, no account, state is per-browser. The repository pattern is in place precisely to make a database swap a single-file change later.
- **Demo-grade rate limiter.** In-memory, process-local. Resets on cold start and doesn't coordinate across Vercel functions. Fine for the assessment; swap for Upstash before real traffic.
- **No auth.** Anyone with the URL can read and write. Acceptable for a demo with no real data.
- **Single AI provider.** Hardcoded to `@ai-sdk/google` + Gemini 2.5 Flash. Swap is a few lines (Vercel AI SDK is provider-agnostic) but not parameterized.

## Deploy

Push to GitHub, import the repo on Vercel, set `GOOGLE_GENERATIVE_AI_API_KEY` in the project's environment variables, and deploy. The full deploy checklist (with manual smoke steps to run against the live URL) is in the response that ended the build, not in this README — but in short:

1. Set `GOOGLE_GENERATIVE_AI_API_KEY` on the Vercel project (without it, Magic Generate returns a 500).
2. After deploy, run the happy path manually on desktop + mobile (Vercel's QR code helps).
3. Look for hydration mismatches and missing env-var errors in the deploy logs.

## Further reading

- [`AI_WORKFLOW.md`](AI_WORKFLOW.md) — how AI was actually used during this build (tools, prompts, what worked, what didn't).
- [`notes/ai-bug.md`](notes/ai-bug.md) — running log of every AI-generated bug we caught, with fixes and lessons.
- [`docs/plans/`](docs/plans/) — design doc and implementation plan, both produced in Claude Code before any code was written.
