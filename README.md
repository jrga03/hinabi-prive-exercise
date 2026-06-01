# The Intelligent Task Orchestrator

A Kanban project manager with AI-assisted task generation, built for the Hinabi Privé Front-End Developer take-home.

**Live demo:** [hinabi-prive-exercise.vercel.app](https://hinabi-prive-exercise.vercel.app/) — see [`#deploy`](#deploy)

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

**AI generation pipeline.** The "Magic Generate" dialog posts to `POST /api/ai/generate-tasks` with `{ projectTitle, projectDescription?, context? }`. The route handler Zod-validates the request (`RequestSchema`), then calls `streamObject({ model: google('gemini-2.5-flash'), schema: AIResponseSchema, … })` and returns `result.toTextStreamResponse()`. The dialog renders partial tasks (title → category → next row) as they arrive; the final accumulated JSON is still constrained to exactly 5 categorized tasks, and on stream close the client bulk-inserts via `taskRepo.createMany`. A demo-grade in-memory rate limiter (10 req / minute, process-local) sits in front; for real traffic, swap it for Upstash + a real key.

For the full design rationale, see [`docs/plans/2026-05-31-intelligent-task-orchestrator-design.md`](docs/plans/2026-05-31-intelligent-task-orchestrator-design.md). For the task-by-task build order, see [`docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md`](docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md).

## Testing

- **Unit tests (Vitest, 23 passing).** `src/lib/repositories/local-storage.test.ts` covers create / get / update / delete, validates that schema-failing inputs reject, that delete cascades to subtasks, and that corrupted localStorage degrades gracefully. `src/app/api/ai/generate-tasks/route.test.ts` covers request validation, the rate limiter, and the streaming-response shape (chunked JSON reassembles into the schema). Run with `npm test`.
- **End-to-end (Playwright, 3 specs).** Run with `npm run test:e2e` against the dev server — the AI route is stubbed so CI doesn't burn the Gemini quota.
  - `tests/e2e/happy-path.spec.ts` — full flow: create project → Magic Generate → drag → edit (with auto-save assertion) → add sub-task → delete project. The stub mirrors `AIResponseSchema` exactly.
  - `tests/e2e/drag-drop.spec.ts` — cross-column and intra-column reorder, including the lower-half drop-position regression from `notes/ai-bug.md`.
  - `tests/e2e/task-edit.spec.ts` — task detail panel: debounced auto-save indicator, select-label rendering, debounce-cancel on close.

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

The live demo runs on Vercel at [hinabi-prive-exercise.vercel.app](https://hinabi-prive-exercise.vercel.app/). To deploy a fresh copy:

**1. Push to GitHub.** Vercel imports straight from the repo — no build config needed; the defaults (`next build`, Node 20+, `.next` output) Just Work.

**2. Set the environment variable.** In _Project Settings → Environment Variables_, add `GOOGLE_GENERATIVE_AI_API_KEY` for the **Production** environment (a free key from [aistudio.google.com](https://aistudio.google.com) is enough for the demo). Without it, the page still loads and CRUD works — only Magic Generate returns a 500.

**3. Trigger the deploy.** Either click _Deploy_ in the import flow or push to `main` once the project is connected. The first build takes ~60 s.

**4. Smoke the live URL.** Run this checklist against the deployed origin before sharing:

- [ ] Home page loads — no hydration warnings in the deploy logs (_Deployments → … → Build Logs / Runtime Logs_).
- [ ] Create a project, open it.
- [ ] Click _Magic Generate_, type a context line, hit generate — 5 categorized tasks stream in and land in **To Do**.
- [ ] Drag a card cross-column and intra-column; refresh — order persists (it's localStorage, so per-browser).
- [ ] Open a task, edit the title, watch the "Saved" indicator appear within ~600 ms.
- [ ] Toggle light / dark theme — no flash, contrast looks right in both.
- [ ] Open Vercel's mobile QR code, repeat the create / generate / drag flow on a phone — touch targets feel ≥ 44 px, drag activates only after the 250 ms long-press (scroll should not pick up a card).
- [ ] Force a failure: temporarily unset `GOOGLE_GENERATIVE_AI_API_KEY` and hit Magic Generate — the dialog should show the inline error card with Retry / Skip, not crash the page. Restore the var after.

**5. Watch the runtime logs.** `vercel logs` or the Runtime Logs tab in the dashboard surfaces any `[ai/generate-tasks] stream error` lines from the route's `onError` handler — useful when Gemini rate-limits or the schema fails to satisfy.

## Further reading

- [`AI_WORKFLOW.md`](AI_WORKFLOW.md) — how AI was actually used during this build (tools, prompts, what worked, what didn't).
- [`notes/ai-bug.md`](notes/ai-bug.md) — running log of every AI-generated bug we caught, with fixes and lessons.
- [`docs/plans/`](docs/plans/) — design doc and implementation plan, both produced in Claude Code before any code was written.
