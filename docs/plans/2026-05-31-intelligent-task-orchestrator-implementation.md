# The Intelligent Task Orchestrator — Implementation Plan

> **For the engineer (you):** Execute this plan in Cursor's Composer + Chat with Claude as the model. Many tasks include a ready-to-paste prompt. Always read the generated code before accepting — the assessment specifically asks you to document a bug Claude introduced and how you fixed it.
>
> **Companion documents:**
> - Design doc: `docs/plans/2026-05-31-intelligent-task-orchestrator-design.md`
> - Cursor prompt library: section 14 of this file

**Goal:** Build "The Intelligent Task Orchestrator," a Kanban-style project/task manager with AI-assisted sub-task generation, in ~32-36 active hours over a 48-hour window.

**Architecture:** Next.js App Router with localStorage backed by a Repository abstraction (swap-ready for Supabase later). Drag-and-drop via dnd-kit with optimistic updates and rollback. AI structured-output via Vercel AI SDK + Gemini 2.5 Flash through a server route. shadcn/ui for primitives, Tailwind v4 tokens for design language, light-first with dark toggle.

**Tech Stack:** Next.js 15 + TypeScript strict, Tailwind v4 + shadcn/ui + lucide-react, TanStack Query v5, @dnd-kit/core + @dnd-kit/sortable, Vercel AI SDK + @ai-sdk/google, React Hook Form + Zod, Framer Motion (sparingly), next-themes, Vitest + Playwright (high-value coverage only), npm, Vercel.

**Testing scope (revision to design doc):** High-value only — Vitest unit tests for repositories and the AI route handler; one Playwright E2E covering the happy path. ~3.5-4 hrs absorbed by trimming Framer Motion to CSS-only transitions where viable.

---

## 0. Pre-flight (do BEFORE the clock starts)

These are 10-minute setup items. Do them the day before so Hour 0 is pure coding.

- [ ] **Google AI Studio API key:** `aistudio.google.com` → create API key. Save as `GOOGLE_GENERATIVE_AI_API_KEY` (note: this exact name is what the SDK's `google()` provider reads by default).
- [ ] **Vercel account:** sign in with GitHub. Confirm the GitHub repo creation flow works for you.
- [ ] **GitHub repo:** decide on the repo name (suggest `intelligent-task-orchestrator` or `tio-hinabi`). Don't create it yet — `create-next-app` will do that via `--use-npm` flow, or you'll do `gh repo create` after the scaffold.
- [ ] **Cursor configured:** sign in, model = Claude (Sonnet 4.6 or Opus 4.7 for trickier tasks). Compose mode keyboard shortcut handy.
- [ ] **Notes file ready:** create a local `notes/ai-bug.md` in a separate text editor. Use it for AI bug/fix capture during the build.
- [ ] **Mobile device for testing:** have a phone ready to test the Vercel preview URL via QR code.

---

## Phase 1 — Setup (Day 1, hours 0:00 – 3:30, ~3.5 hrs)

### Task 1: Scaffold Next.js project (~30 min)

**Files:** create entire project tree under repo root.

**Step 1.1.** From the repo parent directory:

```bash
npx create-next-app@latest intelligent-task-orchestrator \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --no-turbopack
```

**Step 1.2.** `cd intelligent-task-orchestrator`. Verify `npm run dev` boots on `localhost:3000`.

**Step 1.3.** Move the design doc into the new repo:

```bash
mkdir -p docs/plans
mv ../docs/plans/2026-05-31-intelligent-task-orchestrator-design.md docs/plans/
mv ../docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md docs/plans/
```

**Step 1.4.** Create `notes/ai-bug.md` inside the repo (it will move with the repo and can inform AI_WORKFLOW.md). Add `.gitignore` exception if needed (default Next.js ignores nothing here).

**Step 1.5.** Push to GitHub:

```bash
gh repo create intelligent-task-orchestrator --public --source=. --remote=origin
git add -A
git commit -m "chore: scaffold next.js project with typescript and tailwind"
git push -u origin main
```

**DoD:** Repo exists publicly on GitHub, first commit pushed, `npm run dev` boots a styled Next.js home page.

---

### Task 2: Install dependencies + tooling (~30 min)

**Step 2.1.** Install runtime deps:

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  ai @ai-sdk/google zod \
  react-hook-form @hookform/resolvers \
  next-themes lucide-react \
  framer-motion sonner clsx tailwind-merge class-variance-authority
```

**Step 2.2.** Install dev deps:

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom \
  @playwright/test \
  prettier prettier-plugin-tailwindcss
```

**Step 2.3.** Initialize shadcn/ui (canary for Tailwind v4):

```bash
npx shadcn@canary init
```

When prompted: TypeScript yes, Style = default, Base color = zinc, CSS variables = yes, alias `@/components` etc.

**Step 2.4.** Add primitives we'll need:

```bash
npx shadcn@canary add button dialog sheet form input textarea label \
  select dropdown-menu sonner tooltip skeleton card alert
```

**Step 2.5.** Create `.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

**Step 2.6.** Add npm scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

**Step 2.7.** Commit:

```bash
git add -A
git commit -m "chore: install runtime and dev dependencies, init shadcn/ui"
```

**DoD:** All packages installed, shadcn primitives present in `src/components/ui`, `npm run lint` and `npm run dev` both succeed.

**If Tailwind v4 + shadcn canary fights you for > 30 min:** stop, downgrade. Run `npm uninstall tailwindcss @tailwindcss/postcss`, then `npm install -D tailwindcss@3 postcss autoprefixer`, init with `npx tailwindcss init -p`, re-init shadcn without canary. Lose ~1 hr but eliminate the bleeding-edge risk.

---

### Task 3: Deploy hello-world to Vercel (~45 min)

**Why now:** prove the deploy pipeline works at hour 1, not hour 30.

**Step 3.1.** In Vercel dashboard: New Project → Import the GitHub repo → keep defaults → Deploy.

**Step 3.2.** Once deployed, copy the public URL. Add it to a working `README.md`:

```markdown
# The Intelligent Task Orchestrator

Live: <vercel-url>

Implementation plan: docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md
```

**Step 3.3.** Add env vars to Vercel dashboard (Settings → Environment Variables):

| Name | Value | Environments |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | (from AI Studio) | All |
| `NEXT_PUBLIC_BACKEND` | `local` | All |

**Step 3.4.** Create `.env.local` (gitignored already):

```
GOOGLE_GENERATIVE_AI_API_KEY=your-key-here
NEXT_PUBLIC_BACKEND=local
```

**Step 3.5.** Commit and push:

```bash
git add README.md
git commit -m "docs: add live url to readme"
git push
```

Verify the redeploy completes and the README change is visible on Vercel.

**DoD:** Public Vercel URL works. Env vars set. Subsequent pushes auto-deploy.

---

### Task 4: Design tokens, theme provider, layout shell (~1.5 hrs)

**Step 4.1.** Add Inter via `next/font` in `src/app/layout.tsx`:

```tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

// in body className: inter.variable + 'font-sans antialiased'
```

**Step 4.2.** Edit `src/app/globals.css` — set up Tailwind v4 `@theme` block with zinc base + violet accent. Ensure `:root` and `.dark` variants both define every color token. (See companion prompt §14.1 for a ready-to-paste prompt.)

**Step 4.3.** Create `src/components/theme/theme-provider.tsx` wrapping `next-themes` `ThemeProvider` (attribute `class`, defaultTheme `light`, enableSystem `true`).

**Step 4.4.** Wrap children with `<ThemeProvider>` in `layout.tsx`. Add `suppressHydrationWarning` to `<html>`.

**Step 4.5.** Create `src/components/theme/theme-toggle.tsx`:

```tsx
'use client'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
```

**Step 4.6.** Create `src/components/layout/app-header.tsx` — top bar with `TIO` logo (text only is fine), breadcrumb slot, theme toggle right.

**Step 4.7.** Replace default `src/app/page.tsx` content with a minimal header + placeholder body. Verify dark/light toggle works.

**Step 4.8.** Commit:

```bash
git add -A
git commit -m "feat: add design tokens, theme provider, layout shell"
git push
```

**DoD:** Theme toggle works, no hydration warning, both modes look intentional. Vercel deploy passes.

---

## Phase 2 — Data Layer (Day 1, hours 3:30 – 6:30, ~3 hrs)

### Task 5: Zod schemas, types, categories (~45 min)

**Files to create:** `src/lib/schemas.ts`, `src/lib/types.ts`, `src/lib/categories.ts`, `src/lib/constants.ts`.

**Step 5.1.** Write `schemas.ts` per Section 5.1 of the design doc (Project, Task, status enum, category enum).

**Step 5.2.** Write `types.ts` exporting inferred types. Also export input types:

```ts
export type CreateProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateProjectInput = Partial<Pick<Project, 'title' | 'description'>>
export type CreateTaskInput = Omit<Task, 'id' | 'order' | 'createdAt' | 'updatedAt'>
export type TaskStatus = z.infer<typeof TaskSchema.shape.status>
export type TaskCategory = z.infer<typeof TaskSchema.shape.category>
```

**Step 5.3.** Write `categories.ts` with `CATEGORY_META` per Section 5.3.

**Step 5.4.** Write `constants.ts`:

```ts
export const STORAGE_KEYS = {
  projects: 'tio:projects',
  tasks: 'tio:tasks',
} as const

export const COLUMN_META = {
  todo:        { label: 'To Do',       accent: 'bg-zinc-400 dark:bg-zinc-600' },
  in_progress: { label: 'In Progress', accent: 'bg-violet-500' },
  done:        { label: 'Done',        accent: 'bg-emerald-500' },
} as const
```

**Step 5.5.** Commit: `feat(types): add zod schemas, types, and category tokens`.

**DoD:** All types compile (`npm run lint`). No runtime code yet.

---

### Task 6: Repository interfaces + localStorage implementation (~1.5 hrs)

**Files:** `src/lib/repositories/types.ts`, `src/lib/repositories/local-storage.ts`, `src/lib/repositories/index.ts`.

**Step 6.1.** Write `types.ts` with `ProjectRepository` and `TaskRepository` interfaces (Section 4.2 of design doc).

**Step 6.2.** Use the prompt in §14.2 to generate `local-storage.ts`. Critical correctness points to verify in the output:
- Every method returns a Promise (use `Promise.resolve`)
- Reads use `safeParse` and return `[]` on failure
- Writes happen atomically (serialize whole collection per call)
- `crypto.randomUUID()` for IDs
- `delete()` on a task cascades to children (recursive)
- `delete()` on a project also deletes its tasks
- `reorder()` accepts batch updates
- All timestamp fields are ISO strings (`new Date().toISOString()`)

**Step 6.3.** Write `index.ts`:

```ts
import { LocalStorageProjectRepository, LocalStorageTaskRepository } from './local-storage'
import type { ProjectRepository, TaskRepository } from './types'

const backend = process.env.NEXT_PUBLIC_BACKEND ?? 'local'

export const projectRepo: ProjectRepository =
  backend === 'local' ? new LocalStorageProjectRepository() : new LocalStorageProjectRepository()
// TODO: when adding supabase, switch on backend === 'supabase'

export const taskRepo: TaskRepository =
  backend === 'local' ? new LocalStorageTaskRepository() : new LocalStorageTaskRepository()
```

**Step 6.4.** Commit: `feat(data): add repository interfaces and localStorage implementation`.

**DoD:** Open browser console, manually call `projectRepo.create({ title: 'Test' })`. Check `localStorage.getItem('tio:projects')`. Reload, call `projectRepo.list()`, verify the test project is returned.

---

### Task 7: Vitest config + repository tests (~1 hr)

**Files:** `vitest.config.ts`, `src/test/setup.ts`, `src/lib/repositories/local-storage.test.ts`.

**Step 7.1.** Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

**Step 7.2.** Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})
```

**Step 7.3.** Use prompt §14.3 to generate `local-storage.test.ts`. Required coverage:
- Create/list/get/update/delete for projects
- Create/listByProject/update for tasks
- Cascade delete (project → tasks; task → children)
- Reorder updates persist
- Reading corrupt localStorage returns empty array
- Zod schema rejects invalid input

**Step 7.4.** Run `npm test`. All green.

**Step 7.5.** Commit: `test: add repository unit tests with cascade delete coverage`.

**DoD:** `npm test` runs and passes. Coverage of cascade and corruption paths is real.

---

## Phase 3 — Query Hooks (Day 1, hours 6:30 – 7:00, ~30 min)

### Task 8: TanStack Query provider + hooks (~30 min)

**Files:** `src/components/providers.tsx`, `src/hooks/use-projects.ts`, `src/hooks/use-tasks.ts`.

**Step 8.1.** Create `providers.tsx`:

```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }))
  return (
    <QueryClientProvider client={qc}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

**Step 8.2.** Wrap children in `layout.tsx`: `<ThemeProvider><Providers>{children}</Providers></ThemeProvider>`.

**Step 8.3.** Use prompt §14.4 to generate `use-projects.ts` and `use-tasks.ts`. The hooks must:
- Use stable query keys (`['projects']`, `['tasks', 'project', projectId]`)
- Use `useMutation` with `onMutate` (optimistic update), `onError` (rollback), `onSettled` (invalidate)
- Export typed hooks: `useProjects`, `useProject(id)`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useTasks(projectId)`, `useCreateTask`, `useCreateTasksBulk`, `useUpdateTask`, `useReorderTasks`, `useDeleteTask`

**Step 8.4.** Commit: `feat(hooks): add tanstack query hooks for projects and tasks with optimistic updates`.

**DoD:** Hooks compile. Manual smoke in a test page — call `useProjects()`, see logs, verify cache.

---

## Phase 4 — Project CRUD UI (Day 1, hours 7:00 – 10:30, ~3.5 hrs)

### Task 9: Project list page + ProjectCard + EmptyState (~1.5 hrs)

**Files:** `src/app/page.tsx`, `src/components/projects/project-list.tsx`, `src/components/projects/project-card.tsx`, `src/components/ui/empty-state.tsx`.

**Step 9.1.** Create `EmptyState` component (icon, heading, body, optional CTA).

**Step 9.2.** Use prompt §14.5 to generate `ProjectCard` and `ProjectList`. Card must show: title, task count, last updated (relative time via `Intl.RelativeTimeFormat`), hover state, click → navigate to `/projects/[id]`.

**Step 9.3.** Wire `src/app/page.tsx` to `<ProjectList>`. Add a "+ New Project" button in the header.

**Step 9.4.** Commit: `feat(projects): add project list landing page and project card`.

**DoD:** `/` renders. Empty state shows when no projects. Manually-injected projects in localStorage appear as cards.

---

### Task 10: Project create/edit dialog with RHF + Zod (~1.5 hrs)

**Files:** `src/components/projects/project-dialog.tsx`.

**Step 10.1.** Use prompt §14.6 to generate `ProjectDialog`. Required features:
- Controlled `open`/`onOpenChange` props
- `mode: 'create' | 'edit'` + optional `initialData`
- RHF with `zodResolver` validating against a `ProjectFormSchema` derived from `ProjectSchema.pick({ title: true, description: true })`
- Title required (1-120 chars), description optional (max 500)
- On submit: call `useCreateProject` or `useUpdateProject`
- Success: close dialog, toast "Project created" / "Project updated"
- Failure: inline form error from `onError`

**Step 10.2.** Wire the "+ New Project" button to open this dialog in create mode.

**Step 10.3.** Add an edit button to `ProjectCard` (dropdown menu with Edit + Delete).

**Step 10.4.** Commit: `feat(projects): add create and edit dialog with rhf + zod validation`.

**DoD:** Creating and editing projects works. Validation errors render inline. Toast fires on success. Persists across reload.

---

### Task 11: Delete confirm + cascade (~30 min)

**Step 11.1.** Use shadcn's `AlertDialog` for delete confirmation (one extra primitive: `npx shadcn@canary add alert-dialog`).

**Step 11.2.** "Delete project" → confirm → `useDeleteProject` (cascades to tasks via repo).

**Step 11.3.** On delete success: toast "Project deleted", close dialog, list refreshes via invalidation.

**Step 11.4.** Commit: `feat(projects): add delete confirmation with cascade`.

**DoD:** Deleting a project removes it and its tasks. Cancel works. Toast confirms.

---

## Phase 5 — Kanban + D&D (Day 1, hours 11:00 – 15:30, ~4.5 hrs)

Take a 30-minute break here. Hydrate. Re-read what you've built.

### Task 12: Project board page layout (~30 min)

**Files:** `src/app/projects/[id]/page.tsx`, `src/app/projects/[id]/loading.tsx`, `src/app/projects/[id]/error.tsx`.

**Step 12.1.** Page reads `params.id`, fetches project + tasks via hooks. Header shows project title, breadcrumb, **Magic Generate** placeholder button (wired in Phase 6), and Edit/Delete dropdown.

**Step 12.2.** Below header: 3-column layout. Each column titled "To Do" / "In Progress" / "Done" with a count badge and the color accent dot.

**Step 12.3.** `loading.tsx` renders the same skeleton structure (header skeleton + 3 columns each with 2 skeleton cards).

**Step 12.4.** `error.tsx` renders a centered error card with retry.

**Step 12.5.** Commit: `feat(board): add project board page with column scaffolding`.

**DoD:** Navigating to `/projects/[id]` shows the page. Loading state matches final layout (no CLS). Error boundary catches.

---

### Task 13: TaskCard + KanbanColumn (~1 hr)

**Files:** `src/components/kanban/task-card.tsx`, `src/components/kanban/column.tsx`.

**Step 13.1.** `TaskCard` (static for now, no D&D yet): title (truncate at 2 lines), category badge using `CATEGORY_META`, sub-task indicator (`↳ sub of: {parent.title}`) if `parentTaskId`. Click → opens task detail panel (wired in Phase 8).

**Step 13.2.** `KanbanColumn` accepts `status`, `tasks`. Sorts by `order`. Renders `TaskCard` list. Empty column shows dotted-border placeholder.

**Step 13.3.** Wire to the page so tasks render in their columns based on `status`.

**Step 13.4.** Commit: `feat(board): add task card and column components`.

**DoD:** Tasks (manually seeded or via Magic Generate later) appear in correct columns with category badges. Sub-task indicator visible.

---

### Task 14: dnd-kit setup + drag between columns (~2 hrs)

**Files:** `src/components/kanban/board.tsx` (new wrapper).

**Step 14.1.** Use prompt §14.7 (the big one) to generate the dnd-kit wiring. Critical requirements:
- `DndContext` with `PointerSensor` (activation distance 4) and `KeyboardSensor` (`sortableKeyboardCoordinates`)
- `SortableContext` per column with `verticalListSortingStrategy`
- `useSortable` on each `TaskCard`
- `onDragStart`: capture `activeId`, set drag overlay
- `onDragOver`: compute target column from `over.id` (could be a column id or a task id); if task crosses columns, optimistically update the local cache so the UI shows it in the new column immediately
- `onDragEnd`: commit via `useReorderTasks`; on error, rollback to pre-drag snapshot
- `DragOverlay` shows a styled "ghost" of the dragged card

**Step 14.2.** Add a sub-task indicator that hides during drag (clutter reduction).

**Step 14.3.** Commit: `feat(kanban): implement drag-and-drop with dnd-kit via Cursor composer`.

**DoD:** Drag a task across columns — it visually moves immediately, persists after reload. Drag within a column reorders it. Keyboard (Tab to task, Space to pick up, arrow keys, Space to drop) works.

**If something is janky:** the most common bug is the column `over` detection misfiring. Fix by giving each column a unique `id` distinct from any task id (e.g., `column-todo`) and checking with `over.id.toString().startsWith('column-')`.

---

### Task 15: Reorder persistence + edge cases (~1 hr)

**Step 15.1.** Verify the `useReorderTasks` mutation persists correctly. When dragging within a column, the `order` field should be updated. Use fractional ordering if you want to avoid renumbering all tasks (e.g., between order 1 and 2, insert at 1.5; on milestone renumber). For 48 hrs, integer renumbering of just the affected column is fine.

**Step 15.2.** Test: drop into empty column, drop on a single-task column, drop on the top vs bottom of a column, drop and immediately drop again.

**Step 15.3.** Add toast on rollback (intentionally trigger by throwing in the mutation to verify the UX works).

**Step 15.4.** Commit: `feat(kanban): persist reorder and handle rollback`.

**DoD:** Reload preserves order. All four drop scenarios above work. Forced error shows toast and reverts.

---

## Phase 6 — AI Integration v1 (Day 1, hours 15:30 – 17:00, ~1.5 hrs)

### Task 16: API route + prompt + Zod schema (~45 min)

**Files:** `src/app/api/ai/generate-tasks/route.ts`, `src/lib/ai/prompt.ts`, `src/lib/ai/schema.ts`.

**Step 16.1.** Write `prompt.ts` with `SYSTEM_PROMPT` and `buildUserPrompt(body)` per Section 7.2 of the design doc.

**Step 16.2.** Write `schema.ts` with `RequestSchema` and `AIResponseSchema` per Section 7.1.

**Step 16.3.** Use prompt §14.8 to generate `route.ts`. Critical points to verify:
- `runtime = 'nodejs'` (Vercel AI SDK is fine on Node)
- Uses `generateObject` not `generateText`
- Wraps the AI call in try/catch and maps to typed error responses
- Logs server-side, never returns raw error to client
- Returns 400 for bad request, 429 for rate limit (next task), 502 for AI schema failure, 500 otherwise

**Step 16.4.** Manually test the endpoint:

```bash
curl -X POST http://localhost:3000/api/ai/generate-tasks \
  -H "content-type: application/json" \
  -d '{"projectTitle":"Plan a Product Launch"}'
```

Expect a JSON response with 5 tasks.

**Step 16.5.** Commit: `feat(ai): add generate-tasks api route with structured output via Gemini`.

**DoD:** Endpoint returns 5 categorized tasks for a valid request. Returns structured error for invalid input.

---

### Task 17: MagicGenerateButton + dialog + bulk insert (~45 min)

**Files:** `src/components/ai/magic-generate-button.tsx`, `src/components/ai/generate-dialog.tsx`, `src/hooks/use-magic-generate.ts`.

**Step 17.1.** Hook `useMagicGenerate`: `useMutation` that POSTs to the API route, on success calls `useCreateTasksBulk` to persist all 5 tasks (status `todo`, order computed from current column length).

**Step 17.2.** `GenerateDialog`: shadcn Dialog with title "Generate tasks for {project.title}", optional textarea for context (placeholder: "Anything specific? e.g., B2B SaaS, GTM-heavy, etc."), "Generate 5 tasks" button.

**Step 17.3.** Button on the board page header opens the dialog.

**Step 17.4.** Commit: `feat(ai): add magic generate button and dialog`.

**DoD:** Clicking Magic Generate → dialog → submit → 5 tasks appear in To Do column. Reload persists.

---

## End of Day 1 — Checkpoint

You should have: deployed CRUD app with Kanban board, drag-and-drop, and working AI generation. **Push everything.** Sleep.

If significantly behind, evaluate cuts now (don't wait for Day 2):
- Behind by < 2 hrs: skip nothing. You'll catch up Day 2 morning.
- Behind by 2-4 hrs: drop Framer Motion entirely, use CSS-only transitions.
- Behind by > 4 hrs: drop sub-task hierarchy (`parentTaskId` becomes vestigial; skip hierarchy UI). Adjust Task 19 accordingly.

---

## Phase 7 — Task Detail (Day 2, hours 17:00 – 19:30, ~2.5 hrs)

### Task 18: TaskDetailPanel — view + edit fields (~1.5 hrs)

**Files:** `src/components/kanban/task-detail-panel.tsx`.

**Step 18.1.** Use shadcn `Sheet` (side="right", width on desktop ~440px, full-width on mobile).

**Step 18.2.** Form fields: title, description (textarea), status (select), category (select). Use RHF with `zodResolver(TaskSchema.partial())`.

**Step 18.3.** Auto-save on blur / debounced 500ms via `useUpdateTask`. Show "Saved" indicator.

**Step 18.4.** Delete button at bottom with `AlertDialog` confirm.

**Step 18.5.** Click on a `TaskCard` opens the panel (controlled via URL search param `?task=<id>` or local state — local state is simpler).

**Step 18.6.** Commit: `feat(tasks): add task detail panel with auto-save`.

**DoD:** Open panel, edit any field, see live update on board behind. Save indicator works. Reload persists. Delete works.

---

### Task 19: Sub-task UI (parent link + children list) (~1 hr)

**Step 19.1.** In the detail panel, below the form: if `parentTaskId`, show "Parent: <linked title>" (clicking opens the parent in the panel).

**Step 19.2.** Below that: "Sub-tasks" section listing children (use a `listByProject` filter by `parentTaskId === currentTask.id`). Each item: checkbox (toggle done), title, click to open.

**Step 19.3.** "+ Add sub-task" button: inline text input, Enter to create with `parentTaskId = currentTask.id`, default status `todo`, no category.

**Step 19.4.** On the board, `TaskCard`s with `parentTaskId` show a subtle "↳" indicator linking to the parent's title (tooltip-style on hover).

**Step 19.5.** Commit: `feat(tasks): add sub-task hierarchy in detail panel`.

**DoD:** Can create sub-tasks via the panel. They appear on the board with the parent indicator. Toggling done on a sub-task updates the board.

---

## Phase 8 — AI Polish + Vitest AI Tests (Day 2, hours 19:30 – 21:30, ~2 hrs)

### Task 20: AI route handler tests (~30 min)

**Files:** `src/app/api/ai/generate-tasks/route.test.ts`.

**Step 20.1.** Use prompt §14.9 to generate the test. Mock `generateObject` via `vi.mock('ai', ...)`. Cover:
- Valid request returns 200 + parsed body
- Invalid request (missing title) returns 400
- `generateObject` throws → returns 502
- Empty title returns 400

**Step 20.2.** `npm test` passes.

**Step 20.3.** Commit: `test(ai): add route handler tests for error paths`.

**DoD:** Tests run and pass.

---

### Task 21: AI loading state + error UX (~1 hr)

**Step 21.1.** In `GenerateDialog`: during the mutation, render a shimmering placeholder for "5 tasks being generated…" with 5 skeleton lines.

**Step 21.2.** On error: replace skeleton with inline error card showing the error message + Retry button + "Skip and add manually" link. Map error codes to friendly messages per Section 7.4.

**Step 21.3.** Add an `AbortController` so closing the dialog mid-flight cancels.

**Step 21.4.** Commit: `feat(ai): polish loading and error states for magic generate`.

**DoD:** Trigger each error path (kill the dev server mid-call, set rate limit logic to always 429 temporarily, force schema failure) — each renders the correct UX.

---

### Task 22: Stagger animations for new tasks (~30 min)

**Step 22.1.** When 5 tasks land in the To Do column from Magic Generate, animate each with 50ms stagger.

**Step 22.2.** If Framer Motion is in: use `motion.div` with `initial`, `animate`, `transition: { delay: index * 0.05 }`. If using CSS-only: add a custom animation class that consumes `--index` as `animation-delay`.

**Step 22.3.** Commit: `feat(ai): stagger animation for newly generated tasks`.

**DoD:** Watching tasks appear feels intentional, not janky.

---

## Phase 9 — Theme + Motion Polish (Day 2, hours 21:30 – 23:00, ~1.5 hrs, trimmed from 2hr)

### Task 23: Hover, focus, active sweep (~45 min)

**Step 23.1.** Audit every interactive element. Button hover/active states. Card hover lift (subtle bg shift, not shadow). Focus rings on every focusable (`focus-visible:ring-2 ring-violet-600 ring-offset-2`).

**Step 23.2.** Verify dark mode parity on every state.

**Step 23.3.** Commit: `style: comprehensive hover, focus, and active state sweep`.

**DoD:** Tab through the app — every focusable shows a clean focus ring. Hover states feel consistent.

---

### Task 24: Theme toggle animation + reduced motion (~45 min)

**Step 24.1.** Animate the icon swap on theme toggle (rotate + fade). Wrap in `@media (prefers-reduced-motion: reduce)` to disable.

**Step 24.2.** Add `@media (prefers-reduced-motion: reduce)` block in `globals.css` that disables all custom animations.

**Step 24.3.** Toggle macOS System Settings → Accessibility → Reduce Motion to verify.

**Step 24.4.** Commit: `style: theme toggle animation and reduced-motion support`.

**DoD:** Reduced motion mode disables all animations. Without it, the toggle feels polished.

---

## Phase 10 — Empty / Loading / Error States (Day 2, hours 23:00 – 25:00, ~2 hrs)

### Task 25: Polish all empty states (~45 min)

**Step 25.1.** Audit every "no data" state. Per Section 6.5 of design doc, design each:
- `/` with no projects
- Each column with no tasks (separate copy per column)
- Detail panel with no sub-tasks
- Search no results (if you added search — likely not)

**Step 25.2.** Each empty state has: lucide icon, heading, body, optional CTA.

**Step 25.3.** Commit: `feat(ui): polished empty states across the app`.

**DoD:** Every empty state looks designed, not forgotten.

---

### Task 26: Loading skeletons match final layout (~45 min)

**Step 26.1.** Audit `loading.tsx` files. Skeleton structure must exactly match final layout (same heights, columns, padding) so there's zero layout shift on swap.

**Step 26.2.** Pulse animation (shadcn `Skeleton` already does this).

**Step 26.3.** Use Chrome DevTools → Performance → record load → verify CLS = 0.

**Step 26.4.** Commit: `fix(perf): align loading skeletons with final layout for zero cls`.

**DoD:** Lighthouse CLS = 0 on `/` and `/projects/[id]`.

---

### Task 27: Error boundaries (~30 min)

**Step 27.1.** Verify `error.tsx` at root and at `projects/[id]/`. Each shows a branded card with the error, "Try again" button (calls the `reset()` prop), and "Back home" link.

**Step 27.2.** Test by throwing in a component: temporarily add `throw new Error('test')` in the board page, see the route error boundary catch it. Remove.

**Step 27.3.** Commit: `feat(ui): polish error boundaries`.

**DoD:** Forced error renders the boundary cleanly without crashing the app shell.

---

## Phase 11 — Responsive + A11y + Perf (Day 2, hours 25:00 – 28:00, ~3 hrs)

### Task 28: Responsive sweep (~1.5 hrs)

**Step 28.1.** Open Chrome DevTools responsive view. Test 375px, 768px, 1280px.

**Step 28.2.** Mobile (375px): columns stack vertically (already designed). Verify D&D between columns works (long drag). Touch target ≥ 44px on every clickable. Dialog + Sheet full-width on mobile.

**Step 28.3.** Tablet (768px): 3 columns side-by-side, tight padding. No horizontal overflow.

**Step 28.4.** Desktop (1280px+): max-width container, centered. Generous padding.

**Step 28.5.** Test on a real phone via Vercel preview URL + QR code. iOS Safari is the tough one — verify scroll, drag, sheet open/close.

**Step 28.6.** Commit: `feat(responsive): polish layout for mobile, tablet, and desktop`.

**DoD:** All three breakpoints look intentional. No overflow, no overlap. Touch drag works on real device.

---

### Task 29: A11y pass (~45 min)

**Step 29.1.** Run keyboard-only flow: Tab through `/` → open create dialog → fill → submit → click into project → keyboard drag a task → open detail → edit → close. Every interaction must be reachable.

**Step 29.2.** ARIA labels on icon-only buttons (e.g., theme toggle, dropdown menu trigger).

**Step 29.3.** Color contrast: violet-600 on white passes AA. Verify dark mode equivalent.

**Step 29.4.** Run Lighthouse a11y audit. Fix anything below 95.

**Step 29.5.** Commit: `chore(a11y): keyboard navigation and aria labels`.

**DoD:** Lighthouse a11y ≥ 95. Keyboard-only flow works end-to-end.

---

### Task 30: Performance pass (~45 min)

**Step 30.1.** Lighthouse Perf on `/` and `/projects/[id]`. Target ≥ 90.

**Step 30.2.** Common fixes: preload Inter (`next/font` does this), ensure no large unoptimized images (use lucide SVGs only), dynamic-import Framer Motion if it's hurting initial bundle.

**Step 30.3.** Verify no `console.log` left in production code (`grep -rn "console.log" src/`).

**Step 30.4.** Commit: `chore(perf): lighthouse perf optimizations`.

**DoD:** Lighthouse Perf ≥ 90 on both pages. No stray logs.

---

## Phase 12 — Playwright E2E (Day 2, hours 28:00 – 30:00, ~2 hrs)

### Task 31: Playwright setup + happy path E2E (~2 hrs)

**Files:** `playwright.config.ts`, `tests/e2e/happy-path.spec.ts`.

**Step 31.1.** Run `npx playwright install chromium`.

**Step 31.2.** Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 31.3.** Use prompt §14.10 to generate the happy-path spec. Coverage:
- Visit `/`
- Create a project ("E2E Test Project")
- Navigate to its board
- Click Magic Generate → submit dialog → wait for 5 tasks in To Do
- Drag the first task from To Do to In Progress
- Click a task → edit title → close panel
- Delete the task
- Navigate back, delete the project

**Step 31.4.** Note: this test will hit the real Gemini API. For CI this is brittle — for local + assessment submission, it's the right test. Document this trade-off in the test file's comment.

**Step 31.5.** Run `npm run test:e2e` — passes.

**Step 31.6.** Commit: `test(e2e): add playwright happy-path covering full user flow`.

**DoD:** E2E spec passes locally. Documented.

---

## Phase 13 — Final Deploy, Docs, Submit (Day 2, hours 30:00 – 34:00, ~4 hrs)

### Task 32: Final deploy + manual smoke (~30 min)

**Step 32.1.** Push all commits. Wait for Vercel deploy.

**Step 32.2.** Open the live URL. Run the full happy path manually: create project → magic generate → drag → edit → sub-task → delete.

**Step 32.3.** Repeat on mobile (real device via QR code).

**Step 32.4.** Fix any prod-only issues (env vars missing, hydration mismatches, build errors).

**DoD:** Live URL works end-to-end on both desktop and mobile.

---

### Task 33: AI_WORKFLOW.md (~1.5 hrs)

**File:** `AI_WORKFLOW.md` at repo root.

Required content per the brief:

```markdown
# AI Workflow

## Tools Used

- **Cursor** (Composer + Chat) as the IDE-integrated AI surface for code generation and refactoring.
- **Claude** (Sonnet 4.6 / Opus 4.7) as the model behind Cursor's agentic work for complex multi-file tasks.
- **Claude Code** (terminal CLI) for the brainstorming and planning phase — produced this AI_WORKFLOW.md, the design doc, and the implementation plan.

## Initial scaffolding prompt

[Paste the EXACT prompt you used in Cursor Composer to scaffold the project. Should reference the design doc location and key constraints.]

## A specific instance of buggy AI code + the fix

[Pull from notes/ai-bug.md. Required structure:
1. The prompt I gave Claude
2. The buggy output (code snippet)
3. What was wrong (what behavior broke; ideally a screenshot if visual)
4. The fix (follow-up prompt OR manual edit, with the corrected code)
5. Lesson: what prompt pattern or verification would catch this earlier]

## Efficiency metric

| Task | Estimated time without AI | Actual time with AI | Multiplier |
|---|---|---|---|
| Project scaffold + tooling config | 2 hr | 30 min | 4x |
| Data layer + Zod schemas | 3 hr | 1.5 hr | 2x |
| Repository pattern + tests | 4 hr | 2 hr | 2x |
| Kanban + dnd-kit integration | 6 hr | 4 hr | 1.5x |
| AI route handler + dialog | 3 hr | 1.5 hr | 2x |
| Task detail + sub-task UI | 4 hr | 2.5 hr | 1.6x |
| Polish (empty/error/loading) | 6 hr | 3.5 hr | 1.7x |
| Responsive + a11y + perf | 4 hr | 3 hr | 1.3x |
| Tests (Vitest + Playwright) | 4 hr | 2.5 hr | 1.6x |
| Docs (README + this doc) | 2 hr | 1 hr | 2x |
| **Total** | **~38 hrs** | **~22 hrs** | **~1.7x** |

(Replace these with your real numbers — review your commit timestamps for actuals.)

## Workflow notes

- Brainstorming and planning happened in Claude Code (terminal), producing the design doc and this implementation plan. Cursor then implemented against the plan.
- For multi-file refactors (e.g., repository pattern), Composer was preferred. For single-file tweaks (e.g., a specific Tailwind class adjustment), Chat was faster.
- I always read generated code before accepting, particularly dnd-kit logic and Zod schemas — these are areas where models tend to confabulate.
```

**Step 33.1.** Pull the actual bug/fix anecdote from `notes/ai-bug.md`. If you somehow didn't capture one mid-build (you should have!), pick the closest real moment — even a small one is fine. Honesty trumps polish here.

**Step 33.2.** Replace placeholder time estimates with your real numbers from `git log`.

**Step 33.3.** Commit: `docs: add AI_WORKFLOW.md per assessment requirements`.

**DoD:** All three required sections (initial prompt, bug/fix, efficiency metric) are concrete and verifiable.

---

### Task 34: README.md (~45 min)

**File:** `README.md` at repo root.

```markdown
# The Intelligent Task Orchestrator

A Kanban-style project and task manager with AI-assisted sub-task generation, built for the Hinabi Privé Front-End Developer assessment.

**Live:** [<vercel-url>]
**Demo:** [optional - 30-second screen recording link]

## Features

- Full CRUD for projects
- Kanban board with drag-and-drop across To Do / In Progress / Done columns
- AI "Magic Generate" creates 5 categorized tasks from a project title (powered by Google Gemini 2.5 Flash via the Vercel AI SDK)
- Optional sub-tasks per task (flat board view, hierarchical data model)
- Light + dark mode
- Fully responsive (mobile, tablet, desktop)
- Zero CLS, graceful error handling, optimistic updates with rollback

## Tech Stack

Next.js 15 App Router · TypeScript strict · Tailwind v4 · shadcn/ui · TanStack Query · dnd-kit · Vercel AI SDK + Google Gemini 2.5 Flash · React Hook Form + Zod · next-themes · Framer Motion · Vitest · Playwright · npm · Vercel

## Architecture

Persistence is currently localStorage backed by a Repository abstraction (`src/lib/repositories/`), with `LocalStorageProjectRepository` and `LocalStorageTaskRepository` behind typed interfaces. Switching to Supabase is a single-line env-flag change once `SupabaseProjectRepository` is implemented — see `docs/plans/2026-05-31-intelligent-task-orchestrator-design.md` §4.2.

AI calls go through a Next.js route handler (`src/app/api/ai/generate-tasks/route.ts`) that uses Vercel AI SDK's `generateObject` for guaranteed Zod-conformant output.

## Setup

```bash
git clone <repo-url>
cd intelligent-task-orchestrator
npm install
cp .env.example .env.local
# fill in GOOGLE_GENERATIVE_AI_API_KEY (get free key at aistudio.google.com)
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Environment Variables

| Name | Purpose |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key (server only) |
| `NEXT_PUBLIC_BACKEND` | `local` for localStorage (default), `supabase` for future Supabase swap |

## Screenshots

[Insert 3 PNGs in `/docs/screenshots/`:
- 01-board-light.png — project board in light mode
- 02-board-dark.png — same in dark mode
- 03-magic-generate.png — AI dialog with results]

## AI Workflow

See [AI_WORKFLOW.md](./AI_WORKFLOW.md) for the required documentation of Cursor + Claude usage during this build.
```

**Step 34.1.** Take screenshots and save to `docs/screenshots/`.

**Step 34.2.** Create `.env.example`:

```
GOOGLE_GENERATIVE_AI_API_KEY=
NEXT_PUBLIC_BACKEND=local
```

**Step 34.3.** Commit: `docs: add readme, env example, and screenshots`.

**DoD:** README renders cleanly on GitHub. Screenshots embedded.

---

### Task 35: Final commit pass + submit (~45 min)

**Step 35.1.** `git log --oneline` — review every commit message. Each should be conventional, descriptive, and ideally end with `via Cursor composer` or `via Cursor chat` where tool-attributed.

**Step 35.2.** Verify deploy is fresh and live URL works.

**Step 35.3.** Run `npm test` and `npm run test:e2e` one final time.

**Step 35.4.** Draft the submission email. Include:
- Live URL
- GitHub repo URL
- One-paragraph summary
- Reference to `AI_WORKFLOW.md` in the repo
- 30-second loom video (optional but high-signal)

**DoD:** Email sent. Sleep.

---

## 13. Cut list (if running behind)

Triggered automatically if you finish Day 1 < Hour 15 with the AI feature not yet working.

| Cut | Time saved | Impact |
|---|---|---|
| Framer Motion → CSS-only animations | ~1 hr | Subtle, reviewer might not notice |
| Sub-task hierarchy entirely | ~2 hrs | Lose talking point, no spec violation |
| Task 22 (stagger animations) | ~30 min | Tasks appear all at once instead of staggered |
| Skip Lighthouse perf fine-tuning | ~45 min | Risk: Perf score < 90 |
| Skip Playwright E2E | ~2 hrs | Lose meaningful test signal — only cut if desperate |
| Drop dark mode | ~1.5 hrs | Visible; reviewer will notice. Cut last. |

**Do NOT cut:** any task in Phases 1, 2, 3, 4, 5, 6 (foundation), Tasks 25, 27 (empty/error states), Task 33 (AI_WORKFLOW.md), Task 35 (submission).

---

## 14. Cursor Prompt Library

Paste these into Cursor's Composer (`Cmd+I`). They're written to produce code that fits this plan. Always read the output before accepting.

### §14.1 Tailwind v4 design tokens

```
Set up Tailwind v4 design tokens in src/app/globals.css for "The Intelligent Task Orchestrator," a Linear-inspired Kanban app. Read docs/plans/2026-05-31-intelligent-task-orchestrator-design.md §6.1 for the aesthetic.

Requirements:
- Use Tailwind v4 @theme block with CSS variables
- Light mode (:root) and dark mode (.dark) both define every token
- Background hierarchy: white → zinc-50 → zinc-100 (light), zinc-950 → zinc-900 → zinc-800 (dark)
- Border tokens: zinc-200 (light), zinc-800 (dark)
- Single accent: violet-600 (CTAs, focus rings)
- Use Inter via next/font (already imported in layout.tsx as --font-inter)
- Configure font-sans → Inter
- Set up shadcn-compatible color tokens (--background, --foreground, --primary, etc.)
- Smooth scroll-behavior and antialiasing
- @media (prefers-reduced-motion: reduce) block disabling all animations
- DO NOT add arbitrary values; stick to Tailwind defaults

Generate only globals.css. Do not touch other files.
```

### §14.2 Repository localStorage implementation

```
Implement LocalStorageProjectRepository and LocalStorageTaskRepository in src/lib/repositories/local-storage.ts, conforming to the interfaces in src/lib/repositories/types.ts.

Critical requirements:
1. EVERY method returns a Promise (use Promise.resolve), even though localStorage is synchronous — interface contract.
2. Reads MUST use z.safeParse against the schemas in src/lib/schemas.ts. On parse failure: console.warn, return []/null. Never throw to caller.
3. Writes serialize the full collection per entity (one setItem per write).
4. IDs from crypto.randomUUID().
5. Timestamps are ISO strings via new Date().toISOString().
6. Storage keys from src/lib/constants.ts (STORAGE_KEYS.projects, STORAGE_KEYS.tasks).
7. Project deletion cascades to delete all tasks with that projectId.
8. Task deletion cascades to delete all tasks with parentTaskId === deleted task's id (recursive).
9. createMany inserts all tasks in a single setItem call with correct order values appended to the column.
10. reorder accepts batch updates and applies them atomically.

Generate only local-storage.ts. Do not modify schemas, types, or constants.
```

### §14.3 Repository tests

```
Write Vitest unit tests for LocalStorageProjectRepository and LocalStorageTaskRepository in src/lib/repositories/local-storage.test.ts.

Use the existing src/test/setup.ts which clears localStorage before each test.

Required coverage:
- Project CRUD: create + list, get returns null for missing, update merges, delete removes
- Task CRUD: create assigns order at column tail, listByProject filters, update merges, reorder applies batch
- Cascade: deleting a project deletes its tasks; deleting a task with children deletes the subtree
- Corruption: writing invalid JSON to the storage key and calling list returns [] (no throw)
- Zod rejection: feeding an invalid input to create throws ZodError

Use describe/it blocks. Each test must be independent. No mocks needed (real localStorage in jsdom).

Generate only the test file.
```

### §14.4 TanStack Query hooks

```
Generate src/hooks/use-projects.ts and src/hooks/use-tasks.ts using TanStack Query v5.

Read src/lib/repositories/index.ts for the repo instances and src/lib/types.ts for the input types.

Required hooks:
- use-projects.ts: useProjects, useProject(id), useCreateProject, useUpdateProject, useDeleteProject
- use-tasks.ts: useTasks(projectId), useCreateTask, useCreateTasksBulk, useUpdateTask, useReorderTasks, useDeleteTask

Required patterns:
1. Stable query keys: ['projects'], ['projects', id], ['tasks', 'project', projectId]
2. All mutations use onMutate to optimistically update the cache, onError to rollback to the snapshot, onSettled to invalidate.
3. useUpdateTask: optimistic update applies the patch immediately to the cached task.
4. useReorderTasks: optimistic update applies all the order/status changes immediately.
5. useCreateTasksBulk: optimistic update appends all new tasks to the cache.
6. Cancellation: each onMutate first calls queryClient.cancelQueries on the affected key.

Type everything strictly. No 'any'. Generate both files.
```

### §14.5 ProjectCard + ProjectList

```
Generate src/components/projects/project-card.tsx and src/components/projects/project-list.tsx.

Read docs/plans/2026-05-31-intelligent-task-orchestrator-design.md §6.3 for design intent.

ProjectCard:
- Props: project: Project, taskCount: number
- Card with border (no shadow), rounded-md, p-5
- Title (text-base font-medium, truncate)
- Description if present (text-sm text-muted-foreground, line-clamp-2)
- Bottom row: task count badge + relative time (use Intl.RelativeTimeFormat)
- Hover: bg-zinc-50/dark:bg-zinc-900, cursor-pointer
- Whole card is a Link to /projects/{id}
- Dropdown menu (vertical dots icon) in top-right with Edit + Delete actions
- Stop propagation on dropdown clicks

ProjectList:
- Client component
- Uses useProjects() and useTasks() to build the taskCount map (or just listByProject per project — keep it simple)
- Loading: shadcn Skeleton (6 placeholder cards)
- Error: alert with retry
- Empty: <EmptyState> with LayoutDashboard icon, "No projects yet", "+ Create your first project" CTA
- Loaded: grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4

Use shadcn primitives. Type everything. Generate both files.
```

### §14.6 ProjectDialog with RHF + Zod

```
Generate src/components/projects/project-dialog.tsx — a controlled shadcn Dialog for creating and editing projects using React Hook Form + Zod.

Props:
- open: boolean
- onOpenChange: (open: boolean) => void
- mode: 'create' | 'edit'
- initialData?: Project (required when mode === 'edit')

Implementation:
- Define ProjectFormSchema = z.object({ title: z.string().min(1, 'Title is required').max(120), description: z.string().max(500).optional() })
- useForm with zodResolver(ProjectFormSchema), defaultValues from initialData
- useEffect to reset form when initialData changes (for switching between projects)
- Fields: title (Input), description (Textarea)
- Submit: useCreateProject() or useUpdateProject() based on mode
- On success: onOpenChange(false), reset form, toast.success
- On error: form.setError on root with the error message
- Cancel button + Save button at the bottom
- Save button shows "Saving..." with disabled state during mutation

Use shadcn Dialog, Form, Input, Textarea, Button, Label. Type everything. Generate only this file.
```

### §14.7 dnd-kit Kanban board (THE BIG ONE)

```
Implement the drag-and-drop Kanban board in src/components/kanban/board.tsx using @dnd-kit/core and @dnd-kit/sortable.

Read src/components/kanban/column.tsx and src/components/kanban/task-card.tsx for the current static implementation. Refactor TaskCard to use useSortable.

Requirements:

1. Board structure:
   - Props: projectId
   - useTasks(projectId) for data
   - Group tasks by status into todo/in_progress/done arrays, sorted by order
   - 3-column grid (lg:grid-cols-3, vertical stack on mobile)
   - DndContext wraps everything; sensors: PointerSensor (activationConstraint: { distance: 4 }), KeyboardSensor (coordinateGetter: sortableKeyboardCoordinates), collisionDetection: closestCorners

2. Each column has unique droppable id: "column-todo", "column-in_progress", "column-done"
   - SortableContext wraps each column's task list with verticalListSortingStrategy and items=task ids
   - Column itself uses useDroppable with the column-* id

3. TaskCard refactor:
   - useSortable({ id: task.id })
   - Apply transform/transition styles
   - isDragging styles (opacity-50, hide content keep skeleton)
   - listeners + attributes on the drag handle (entire card)

4. onDragStart: set local activeTask state
5. onDragOver:
   - Detect if over a column or another task
   - If task moved to a different column: optimistically reorder the cache (call queryClient.setQueryData) so UI shows the move immediately
   - This is the "fix" for ghost-stuck-in-original-column UX issues
6. onDragEnd:
   - Final commit: build the updates array (task id, new status, new order) for the affected column(s)
   - Call useReorderTasks().mutate(updates)
   - On error: rollback via the snapshot from onDragStart
   - Clear activeTask

7. DragOverlay (rendered outside DndContext) shows the active task card during drag with a slight rotation (rotate-3) and shadow.

8. Accessibility: aria-label on each task card describing position ("Task: {title}, column: {status}, position {n} of {total}")

Type strictly. Use TypeScript discriminated unions where helpful. Generate only board.tsx; modify column.tsx and task-card.tsx as needed and show me the diffs.

IMPORTANT: this is the most error-prone code in the project. Generate carefully and explain any non-obvious choices.
```

### §14.8 AI route handler

```
Implement the /api/ai/generate-tasks route handler in src/app/api/ai/generate-tasks/route.ts using Vercel AI SDK and Gemini 2.5 Flash.

Read:
- src/lib/ai/prompt.ts for SYSTEM_PROMPT and buildUserPrompt
- src/lib/ai/schema.ts for RequestSchema and AIResponseSchema

Requirements:

1. Use `google('gemini-2.5-flash')` from @ai-sdk/google
2. Use `generateObject` from 'ai' with schema=AIResponseSchema
3. POST handler accepts JSON, validates with RequestSchema
4. Response structure: { tasks: [...] } on success, { error: string } on failure
5. Status codes:
   - 200: success
   - 400: invalid request body (return zod errors flattened to a string)
   - 502: AI returned data that fails AIResponseSchema (the SDK handles internal retries; if it still fails, it throws)
   - 500: any other unhandled error
6. Server-side logging via console.error for any 5xx
7. Never expose raw error messages or stack traces in the response

Light-touch rate limiting:
- Module-level Map<string, { count: number, resetAt: number }> keyed by IP (from request.headers.get('x-forwarded-for'))
- 10 requests per minute per IP
- On exceeded: return 429 with { error: 'Too many requests. Try again in a moment.' }
- Document this is demo-grade and not production-safe

Use:
- export const runtime = 'nodejs'
- export const dynamic = 'force-dynamic'

Type strictly. Generate only route.ts.
```

### §14.9 AI route handler tests

```
Write Vitest tests for src/app/api/ai/generate-tasks/route.ts in src/app/api/ai/generate-tasks/route.test.ts.

Mock the 'ai' package: vi.mock('ai', () => ({ generateObject: vi.fn() }))
Mock the '@ai-sdk/google' package similarly.

Coverage:
1. Valid request → 200 with parsed body containing 5 tasks
2. Missing projectTitle → 400 with error
3. Empty string projectTitle → 400 with error
4. generateObject throws → 502 with friendly error
5. Multiple rapid requests from same IP → 11th returns 429

Use the NextRequest Web API standard (e.g., new Request(url, { method: 'POST', headers: {...}, body: JSON.stringify({...}) })).

Reset mocks between tests. Generate only the test file.
```

### §14.10 Playwright happy-path E2E

```
Write a Playwright E2E test in tests/e2e/happy-path.spec.ts.

Goal: validate the full user journey end-to-end.

Test steps:
1. Visit /
2. Click "+ New Project"
3. Fill title with "E2E Test Project {Date.now()}" (uniqueness avoids test pollution)
4. Submit dialog
5. Wait for the project card to appear in the list
6. Click the project card
7. Wait for /projects/[id] to load
8. Click "Magic Generate"
9. Submit the dialog with no extra context
10. Wait for 5 task cards to appear in the To Do column (poll with timeout=15s for AI latency)
11. Get the first task. Use Playwright's drag_and_drop or a manual pointer sequence to move it to the In Progress column.
12. Verify the task now appears in In Progress (data-testid pattern: data-testid="column-in_progress" containing the task)
13. Click that task → detail panel opens (data-testid="task-detail-panel")
14. Edit title to "Edited via E2E"
15. Close panel
16. Verify the new title shows on the board
17. Delete the task via the detail panel
18. Verify the task no longer appears
19. Navigate back to /
20. Delete the project via dropdown
21. Verify the project is gone

Constraints:
- Add data-testid attributes to the components as needed (request these explicitly in the generated test, then you'll add them to the components)
- Use Playwright's expect with toBeVisible / toHaveCount
- Comments noting that this test calls the real Gemini API (5-15s) and is not CI-safe without API key + budget

Generate only the spec file. List which data-testid attributes need to be added to which components.
```

---

## 15. Submission checklist

- [ ] Live URL on Vercel is publicly accessible
- [ ] GitHub repo is public (or shared with reviewer)
- [ ] `README.md` with live URL, setup, screenshots
- [ ] `AI_WORKFLOW.md` with all three required sections
- [ ] `docs/plans/2026-05-31-intelligent-task-orchestrator-design.md` (design doc) committed
- [ ] `docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md` (this plan) committed
- [ ] Conventional commits in `git log` — at least 20 distinct, descriptive commits
- [ ] At least 2 commits attributed to Cursor (`via Cursor composer` or `via Cursor chat`)
- [ ] `npm test` passes (Vitest)
- [ ] `npm run test:e2e` passes (Playwright)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Lighthouse: Perf ≥ 90, A11y ≥ 95, CLS = 0
- [ ] Tested on real mobile device (iOS Safari or Android Chrome)
- [ ] Dark mode parity verified
- [ ] All empty states designed
- [ ] All error states designed
- [ ] Submission email sent with live URL + repo URL

---

End of plan.
