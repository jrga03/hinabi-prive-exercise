# Design: The Intelligent Task Orchestrator (TIO)

**Date:** 2026-05-31
**Author:** Jason Acido (with Claude)
**Context:** Hinabi Privé Front-End Developer take-home. 72-hour brief compressed to 48 hours of calendar time, ~32-36 active hours.

---

## 1. Goals

Build a production-ready Kanban-style project and task manager with AI-assisted sub-task generation. The assessment is graded across three axes — **Design & UI/UX**, **Functional Features**, and **Optimization & Reliability** — and the design here targets all three.

1. Match the brief's grading criteria exactly: Design Eye, full CRUD, AI feature, zero CLS, graceful errors, conventional commits, live deploy, AI_WORKFLOW.md.
2. Demonstrate production-grade architecture even with local storage: typed data layer, validated reads, swap-ready repository pattern, error boundaries.
3. Ship within ~32-36 active hours over a 48-hour window.

## 2. Non-Goals

Explicitly out of scope to protect the timeline:

- Authentication, multi-user, real-time sync (the repository pattern leaves the door open for Supabase later)
- Real database in v1 (localStorage with versioned namespace)
- Streaming AI output (`generateObject` is more reliable for structured 5-task output)
- Mobile horizontal swipe between columns (vertical stack instead)
- AI-generated sub-tasks at the task level (project-level only in v1)
- Recursive sub-task UI (data model supports N levels; UI exposes one)
- Automated tests beyond manual smoke (Vitest/Playwright too costly in 48 hrs; documented as a known trade-off)

## 3. Stack

- **Framework:** Next.js 15 (App Router) + TypeScript strict
- **Styling:** Tailwind CSS v4 + shadcn/ui (canary for v4) + lucide-react
- **State & data:** TanStack Query v5
- **Drag-and-drop:** @dnd-kit/core + @dnd-kit/sortable
- **AI:** Vercel AI SDK (`ai`) + `@ai-sdk/google` (Gemini 2.5 Flash, free tier) + Zod
- **Forms:** React Hook Form + `@hookform/resolvers/zod`
- **Animation:** Framer Motion (sparingly — enter/exit on tasks, dialog transitions)
- **Theme:** next-themes, Tailwind dark mode, light default
- **Package manager:** npm
- **Quality:** ESLint flat config + Prettier + `prettier-plugin-tailwindcss`
- **Deployment:** Vercel

## 4. Architecture

### 4.1 File structure

```
src/
  app/
    (marketing)/page.tsx                # Project list (landing)
    projects/[id]/
      page.tsx                          # Kanban board
      loading.tsx                       # Skeleton
      error.tsx                         # Route-level error boundary
    api/ai/generate-tasks/route.ts      # POST endpoint
    layout.tsx
    globals.css
    error.tsx                           # Root error boundary
    not-found.tsx
  components/
    ui/                                 # shadcn primitives
    kanban/
      board.tsx
      column.tsx
      task-card.tsx
      task-detail-panel.tsx
    projects/
      project-list.tsx
      project-card.tsx
      project-dialog.tsx                # Create/edit modal
    ai/
      magic-generate-button.tsx
      generate-dialog.tsx
    theme/
      theme-toggle.tsx
      theme-provider.tsx
  hooks/
    use-projects.ts
    use-tasks.ts
    use-magic-generate.ts
  lib/
    schemas.ts                          # Zod: Project, Task
    types.ts                            # Inferred TS types
    categories.ts                       # Category enum + color tokens
    repositories/
      types.ts                          # ProjectRepository, TaskRepository interfaces
      local-storage.ts                  # v1 implementation
      index.ts                          # Factory based on env flag
    ai/
      prompt.ts
      schema.ts                         # AI output Zod schema
    utils.ts
    constants.ts
```

### 4.2 Persistence — Repository pattern (swap-ready)

The data layer is designed so swapping from localStorage to Supabase later is a one-line env-flag change. Four discipline rules make this real:

1. **Every repository method returns a Promise** even when the underlying storage is synchronous. Callers can't tell the difference now or later.
2. **Zod validates every read** via `safeParse`. Corrupted or stale localStorage data degrades to an empty list rather than crashing the app — the same defense pattern we'd want for API responses.
3. **All data access goes through TanStack Query**. Components never touch the repository directly. Swapping the `queryFn` is the only client-side change when the backend lands.
4. **`NEXT_PUBLIC_BACKEND` env flag** picks the implementation: `local` (v1) or `supabase` (future).

Interfaces:

```ts
interface ProjectRepository {
  list(): Promise<Project[]>
  get(id: string): Promise<Project | null>
  create(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>
  update(id: string, patch: Partial<Pick<Project, 'title' | 'description'>>): Promise<Project>
  delete(id: string): Promise<void>
}

interface TaskRepository {
  listByProject(projectId: string): Promise<Task[]>
  create(input: Omit<Task, 'id' | 'order' | 'createdAt' | 'updatedAt'>): Promise<Task>
  createMany(inputs: Array<Omit<Task, 'id' | 'order' | 'createdAt' | 'updatedAt'>>): Promise<Task[]>
  update(id: string, patch: Partial<Task>): Promise<Task>
  reorder(updates: Array<{ id: string; status: TaskStatus; order: number }>): Promise<void>
  delete(id: string): Promise<void>     // cascades to children
}
```

### 4.3 Storage strategy (v1)

- Keys: `tio:projects`, `tio:tasks` (versioned namespace; bump to `tio_v2:` on breaking schema changes)
- Writes: serialize whole collection per entity (small data; simple)
- Reads: `safeParse` via Zod; on failure log warning and return `[]`
- IDs: `crypto.randomUUID()`
- Async wrap: `Promise.resolve(value)` — keeps contract

### 4.4 TanStack Query keys

```ts
projects: { all: ['projects'], detail: (id) => ['projects', id] }
tasks:    { byProject: (pid) => ['tasks', 'project', pid] }
```

Optimistic update pattern for drag-and-drop:
1. On drop: update query cache immediately (snappy UX)
2. Fire `reorder()` mutation
3. On error: rollback via captured previous cache value + show toast

## 5. Data Model

### 5.1 Schemas

```ts
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export const TASK_CATEGORIES = ['strategy', 'design', 'engineering', 'marketing', 'operations'] as const

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const TaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES),
  category: z.enum(TASK_CATEGORIES).nullable(),
  order: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type Project = z.infer<typeof ProjectSchema>
export type Task = z.infer<typeof TaskSchema>
```

### 5.2 Hierarchy model

- **Flat visual model, hierarchical data model.** Board displays all tasks of the project regardless of parent/child relationship.
- A subtle indicator (e.g., "↳ sub of: Foo") appears on cards with a `parentTaskId`.
- The task detail panel is where hierarchy is exposed: parent link, child list, "+ Add sub-task" button.
- The data model supports N levels; UI exposes one level of children.
- Cascade delete: deleting a task removes its subtree (simplest and most predictable).

### 5.3 Categories

Five fixed categories with paired color tokens (Tailwind palette, both modes):

| Category | Tone |
|---|---|
| Strategy | violet |
| Design | rose |
| Engineering | blue |
| Marketing | amber |
| Operations | emerald |

Color tokens lighten in light mode and deepen for legibility in dark mode.

## 6. UI Design

### 6.1 Aesthetic direction

Linear-inspired, **light-first** with polished dark toggle. Both modes share the same visual grammar.

- **Background hierarchy** (light): `bg-white` → `bg-zinc-50` → `bg-zinc-100`. (Dark): `bg-zinc-950` → `bg-zinc-900` → `bg-zinc-800`.
- **Borders** as the primary depth signal, not shadows. `border-zinc-200` / `border-zinc-800`. Hairline.
- **Typography:** Inter (variable, via `next/font`). Sizes: `text-2xl` H1, `text-base` card titles, `text-sm` body, `text-xs uppercase tracking-wide` labels.
- **Single accent color:** `violet-600`. CTAs, focus rings, selected states. Never decorative.
- **Radius:** `rounded-md` cards, `rounded-lg` dialogs, `rounded-full` badges.
- **Shadows:** none on cards. `shadow-lg` only on floating overlays (Sheet, Dialog).
- **Spacing:** strict Tailwind defaults (4, 8, 12, 16, 24, 32). No arbitrary values.
- **Motion:** 150ms hover, 200ms enter, 100ms exit, all eased. Respect `prefers-reduced-motion`.

### 6.2 Routes

| Route | Purpose |
|---|---|
| `/` | Project list (landing) with grid of `ProjectCard` and "New Project" CTA |
| `/projects/[id]` | Kanban board for project. Header has title, breadcrumb, Magic Generate. |
| `*` | Custom 404 |

### 6.3 Component inventory

| Component | shadcn primitive | Notes |
|---|---|---|
| `Button` | Button | Add `loading` variant |
| `ProjectDialog` | Dialog + Form | RHF + Zod resolver |
| `TaskDetailPanel` | Sheet (right) | Edit fields, parent link, children list, delete |
| `Toast` | Sonner | AI success/error feedback |
| `Tooltip` | Tooltip | Truncated card titles |
| `KanbanBoard` | none | DndContext, pointer + keyboard sensors |
| `KanbanColumn` | none | SortableContext, droppable |
| `TaskCard` | none | Sortable, draggable, sub-task indicator |
| `MagicGenerateButton` | Button + Dialog | Pre-flight context input |
| `ThemeToggle` | Button | Sun/moon swap |
| `EmptyState` | none | Reusable across no-projects, no-tasks, AI error |

### 6.4 Responsive plan

- **≥ 1280 px:** 3 columns side-by-side, max-width 1400 px, centered.
- **768–1279 px:** 3 columns, tighter padding, horizontal scroll if needed.
- **< 768 px:** Columns stack vertically. Each column section scrolls independently if very long.
- **Tap targets:** ≥ 44 px on touch.
- **Dialog/Sheet:** full-width sheet on mobile, side panel on tablet+.

### 6.5 Empty, loading, and error states (Design Eye criterion)

- **No projects:** centered `EmptyState` with `LayoutDashboard` icon, "Create your first project" CTA. Light background, no border.
- **No tasks (per column):** dotted-border placeholder, muted copy, `Sparkles` icon link to Magic Generate.
- **AI failure:** generate dialog stays open with inline error + retry + "Skip and add manually" link. Toast confirms outcome.
- **Loading (`loading.tsx`):** skeletons match final layout exactly to guarantee CLS = 0. Six skeleton project cards on `/`, three columns each with three skeleton task cards on `/projects/[id]`.
- **Route errors (`error.tsx`):** branded fallback card, "Something went wrong" + retry + "Back home" links. Logs to console in dev.
- **Root error boundary** for last-resort catches.

## 7. AI Integration

### 7.1 Server route (`app/api/ai/generate-tasks/route.ts`)

```ts
const RequestSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  projectDescription: z.string().max(500).optional(),
})

const AITaskSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(['strategy', 'design', 'engineering', 'marketing', 'operations']),
  description: z.string().max(500).optional(),
})

const AIResponseSchema = z.object({
  tasks: z.array(AITaskSchema).length(5),
})
```

`generateObject` (not `generateText`) — Vercel AI SDK guarantees schema-conformant output via internal retry.

### 7.2 Prompt (`lib/ai/prompt.ts`)

```
SYSTEM:
You are a project planning assistant for a Kanban task tool.
Given a project title, return exactly 5 concrete, actionable tasks.
Rules:
- Specific and self-contained (e.g., "Draft press release outline", not "Marketing")
- Exactly one category per task from: strategy, design, engineering, marketing, operations
- Spread categories where possible
- Imperative voice, 3-10 words, no trailing period
- Optional description: one sentence of context if it adds clarity

USER:
Project title: "{projectTitle}"
{If description: "Context: {description}"}
```

### 7.3 Client flow

1. Click Magic Generate on project page
2. Pre-flight dialog: confirms title, accepts optional context, "Generate 5 tasks" button
3. Submit → POST `/api/ai/generate-tasks`, loading state, dialog stays open with shimmer
4. Success → close dialog, toast "5 tasks added", stagger-animate cards into To Do column (50 ms delay each)
5. Error → inline message + retry + "Skip and add manually"

### 7.4 Error taxonomy

| Error type | Detection | UX |
|---|---|---|
| Network | fetch `TypeError` | "Connection issue. Retry." + retry button |
| Rate limit (429) | `response.status === 429` | "Too many requests. Wait a moment." + retry disabled 5 s |
| Server / model (5xx) | `response.status >= 500` | "Our AI hit a snag. Try again or add manually." |
| Schema validation (server) | caught in route | 502 + "AI returned unexpected output. Try again." |
| Missing API key (dev) | route throws | 500 + dev-friendly console message |
| User cancel | AbortController | Silent, dialog stays open, button re-enabled |

### 7.5 Crash-prevention guarantees

- Top-level `app/error.tsx` catches uncaught errors
- Per-route `error.tsx` in `projects/[id]/`
- Repository reads `safeParse` → return `[]` on corruption
- AI route never throws to the client; always returns structured error JSON
- ESLint rule or build-time grep against `GOOGLE_GENERATIVE_AI_API_KEY` in client bundles; fail build if leaked

### 7.6 Light-touch abuse prevention

In-memory Map keyed by IP, 10 requests per minute per IP. Resets on process boot. Documented in code as "demo-grade, swap for Upstash in production."

### 7.7 Environment variables

| Var | Where | Purpose |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Vercel dashboard (server only) | Gemini API access |
| `NEXT_PUBLIC_BACKEND` | Vercel + `.env.local` | `local` in v1, `supabase` later |

## 8. 48-Hour Schedule

Two days, ~17 active hours each. Each phase has a Definition of Done; don't move on until met.

### 8.1 Day 1 — Foundation & Core (~17 hours)

| Hours | Phase | Key Deliverables | DoD |
|---|---|---|---|
| 0:00 – 0:30 | Setup A | `create-next-app`, init git, push GitHub | First commit pushed |
| 0:30 – 1:30 | Setup B | shadcn init, deps install, lint/format config | `npm run dev` boots |
| 1:30 – 2:30 | Setup C | Deploy hello-world to Vercel, set env vars | Public URL works |
| 2:30 – 3:30 | Design tokens | Theme tokens, Inter, dark toggle, header shell | Toggle works in both modes |
| 3:30 – 5:30 | Data layer | Zod schemas, repositories, factory | Persists across reloads |
| 5:30 – 6:30 | Query hooks | Provider, projects + tasks hooks, optimistic patterns | Hooks return real data |
| 6:30 – 10:30 | Project CRUD UI | List, card, create/edit dialog, delete confirm, empty state | Full CRUD works, polished |
| 10:30 – 11:00 | Break / commit | Push, review | Branch clean |
| 11:00 – 15:30 | Kanban + D&D | Board, columns, task cards, dnd-kit, optimistic + rollback | Drag works, keyboard accessible |
| 15:30 – 17:00 | AI v1 | Route, prompt, schema, button, dialog | 5 tasks added on click |
| 17:00 | Sleep | — | Brain recovery |

### 8.2 Day 2 — Polish, Edge Cases, Documentation (~17 hours)

| Hours | Phase | Key Deliverables | DoD |
|---|---|---|---|
| 17:00 – 19:30 | Task detail sheet | Open, edit, parent/children, delete | Full task editing |
| 19:30 – 21:30 | AI polish | Pre-flight, loading, error UX, stagger | All 5 error paths handled |
| 21:30 – 23:30 | Theme + motion | Hover/focus/active sweep, dark parity, reduced motion | No jank in either mode |
| 23:30 – 25:30 | Empty / loading / error states | All states designed, error boundaries | Every state has a view |
| 25:30 – 28:00 | Responsive sweep | 375 / 768 / 1280, touch targets | No overflow on any size |
| 28:00 – 29:30 | A11y + perf | Lighthouse ≥ 90 perf, ≥ 95 a11y, CLS 0 | Targets met |
| 29:30 – 30:30 | Final deploy + smoke | Push, run full flow on prod | Works end-to-end on mobile |
| 30:30 – 33:00 | AI_WORKFLOW.md + README | Scaffold prompt, bug/fix anecdote, efficiency metric | Both files committed |
| 33:00 – 34:00 | Final commit pass | Clean up WIP, submit | Conventional commit log |
| 34:00 – 36:00 | Buffer | — | Reserved |

### 8.3 Risk register

**Most likely to eat time:**
- dnd-kit + optimistic updates with rollback edge cases (touch + keyboard)
- Tailwind v4 + shadcn canary compatibility (fast-fail to v3 if it fights you)
- Mobile D&D touch behavior (test on a real phone early on Day 1)

**Cut list, in order, if behind:**
1. Framer Motion → CSS-only transitions (~1 hr saved)
2. Sub-task hierarchy (delete `parentTaskId`, hide parent/child UI) (~2 hrs saved)
3. Mobile horizontal swipe (already not planned — vertical stack is final)
4. AI streaming (already cut — `generateObject` only)
5. In-memory rate limit (~30 min saved, low signal)
6. Dark mode toggle (~1.5 hrs saved, will be visibly missing)

**Do NOT cut:**
- Empty states, error handling, AI_WORKFLOW.md, conventional commits, mobile responsive, live deploy

### 8.4 Commit discipline

Conventional commits, frequent and descriptive. Format for tool-attributed work:

```
<type>(<scope>): <subject> via <tool>
```

Example: `feat(kanban): implement drag-and-drop via Cursor composer`

Keep a running `notes/ai-bug.md` from hour 0. The moment Claude produces buggy code, capture: prompt, output, the bug, the fix. The AI_WORKFLOW.md requires a real example — don't reconstruct it at hour 33.

## 9. Deliverables

| Item | Format | Location |
|---|---|---|
| Live deployment | Public URL | Vercel |
| Source code | GitHub repo with conventional commits | GitHub |
| AI_WORKFLOW.md | Markdown | Repo root |
| README.md | Markdown with live URL, setup, env, screenshots | Repo root |

## 10. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Persistence | localStorage with repository abstraction | Fits 48-hr scope; swap-ready for Supabase. |
| Auth | None | Out of scope for 48-hr; localStorage is single-user by nature. |
| AI provider | Google Gemini 2.5 Flash (free) | Zero cost, generous limits, great structured output. |
| AI feature scope | Project-level only | Brief's example is project title; sub-task gen on tasks adds 4+ hrs. |
| Hierarchy | Flat board, hierarchical data | Honors `parentTaskId` semantics without complicating board grading. |
| Cascade delete | Delete subtree | Simpler than re-parenting; predictable. |
| Theme | Light-first, dark toggle | Safer first impression; dark adds signal. |
| Mobile Kanban | Vertical stack | Most accessible; D&D between columns still works. |
| State library | TanStack Query | Optimistic D&D + swap-ready data source. |
| Animations | Framer Motion sparingly | Cuttable risk-mitigant if behind schedule. |
| Tests | Manual smoke only | Vitest/Playwright too costly in 48 hrs. |

## 11. Open follow-ups (post-submission)

- Supabase swap: implement `SupabaseProjectRepository`, flip `NEXT_PUBLIC_BACKEND`, add auth UI.
- Sub-task AI generation: extend Magic Generate to work from task detail.
- Streaming AI: switch to `streamObject` once UX is settled.
- Vitest + Playwright: unit tests for repos, e2e for happy path.
- Activity log / comments on task detail.
- Real rate limiting via Upstash.
