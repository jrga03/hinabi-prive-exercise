# AI Workflow

How AI was actually used to build **The Intelligent Task Orchestrator** for the Hinabi Privé take-home. Source material: the implementation plan in `docs/plans/`, the running bug log in `notes/ai-bug.md`, and `git log`.

---

## Tools used

| Surface                        | Where it ran                           | What it was best at                                                                                                                                                              |
| ------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code (terminal CLI)** | macOS terminal, Opus 4.7 (1M context)  | Brainstorming, design doc, implementation plan, multi-file scaffolding, single-file refactors, the test/lint/typecheck loop end-to-end, bug triage. Every prompt below ran here. |
| **`shadcn@canary` CLI**        | Terminal, scaffolds Base UI primitives | Adding individual primitives. Treated as an AI-adjacent tool — it generates real code into the repo.                                                                             |

A single Claude Code thread was the source of truth for the whole build — design doc, implementation plan, every code-gen prompt, the failing-test debugging loop. Keeping context in one place meant the model had the full history when I asked it to revisit a file later, and the conversation transcript doubled as a build log when I needed to retrace a decision.

---

## Initial scaffolding prompt

This is verbatim what I gave Claude Code at the start of the build, after both `docs/plans/2026-05-31-intelligent-task-orchestrator-design.md` and `docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md` were already in the repo:

> Working directory is the Next.js scaffold I just created with `create-next-app`. Read `docs/plans/2026-05-31-intelligent-task-orchestrator-design.md` and `docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md` — those are the spec.
>
> Important constraint: this is Next.js 16, not the Next.js you know. APIs and conventions may differ from your training data. Before writing any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Same goes for Tailwind v4 (no `tailwind.config.ts` — use `@theme` in `globals.css`), Zod v4 (`z.uuid()`, `z.iso.datetime()`, `z.enum(values)` top-level), and `@base-ui/react` (this shadcn flavor is Base UI, not Radix).
>
> Execute Phase 1 (Tasks 1–3) of the implementation plan: dependencies, design tokens + theme provider, shadcn primitives. Commit progressively with conventional commit subjects, single line only, no body, no Co-Authored-By trailer.

Two pieces did real work here:

1. **"Not the Next.js you know"** — without it, the model wrote Next 13/14 patterns (e.g. `useRouter` from `next/router`, the old `getServerSideProps` mental model) that would have looked correct and silently broken in Next 16.
2. **"Commit progressively"** — turned the run into a series of small, reviewable diffs instead of one giant landing. Every commit became an audit point.

That prompt produced commits `66902af` (deps), `9245817` (shadcn init), and `6c0d061` (theme tokens + layout shell).

---

## Three representative prompts

### 1 · Feature: Kanban board with drag-and-drop (commit `77158b1`)

> Implement `src/components/kanban/board.tsx` per Task 14 / §14.7 of the implementation plan. Wrap the three columns in `DndContext` with `MouseSensor` (8px activation) + `KeyboardSensor`. On drag end, build the updates array from the over.id position and call `useReorderTasks().mutate(updates)`. Use optimistic updates via `setQueryData(['tasks', 'project', projectId], next)` and roll back on error. Don't add `onDragOver` for now — column-level highlighting is a nice-to-have, not the spec.

Worked first try for cross-column moves. Did **not** work for intra-column drag-by-one — see [the dnd-kit bug below](#3--dnd-kit-arraymove-mistake-commit-063df00).

### 2 · Bug fix: Auto-save silently dead (commit `529cf59`)

Follow-up prompt while staring at a Playwright failure where the "Saved" indicator never appeared:

> The Playwright spec types into the task title, waits 600 ms, expects "Saved" to appear, times out. The form's `onChange` fires, the debounce timer runs, but `updateTask.mutate` never gets called. Walk me through `src/components/kanban/task-detail-panel.tsx` line by line. Don't propose a fix yet — tell me which branch is bailing.

Claude correctly identified that `form.formState.isValid` inside the `setTimeout` callback was returning a stale `false` because RHF v7's proxy only tracks fields accessed during render. I then asked for the fix:

> OK. Remove the `formState.isValid` check entirely — `safeParse(values)` is already the authoritative validator. Add a one-paragraph comment explaining the deliberate removal so the next person doesn't put it back.

One-line patch + 5-line comment. The lesson is in `notes/ai-bug.md`.

### 3 · Refactor: Share the board skeleton (commit `409268c`)

> The board's loading skeleton is duplicated in `src/app/projects/[id]/loading.tsx` and in the `<Suspense fallback>` inside `board.tsx`. Extract them into a single `BoardSkeleton` component and use it from both call sites. Make sure the route-level `loading.tsx` still works — it's a Next.js convention, not a normal React import.

Single-file extract, two call-sites updated. Took ~3 minutes. The reason it's representative: this is exactly the kind of mechanical refactor Claude handles well — the spec is unambiguous, the edits are local, and "do not break the convention" is something the model can honor reliably when you name the convention explicitly.

---

## When AI helped

- **Brainstorming and planning.** The design doc (`docs/plans/2026-05-31-intelligent-task-orchestrator-design.md`) and implementation plan (`docs/plans/2026-05-31-intelligent-task-orchestrator-implementation.md`) were produced in Claude Code over ~90 minutes of back-and-forth. Doing that solo would have been a full day, and the plan turned out to be load-bearing — every subsequent prompt referenced it.
- **Zod schemas + TanStack Query patterns.** Stable, well-trained territory. The schemas in `src/lib/schemas.ts` and the optimistic-update hooks in `src/hooks/use-tasks.ts` were close to first-try usable (one async fix described below).
- **Repository pattern scaffold.** Two interfaces + a localStorage implementation + a factory + ~20 unit tests landed in commits `5f2b222` → `11fb53a` (~5 min wall time). Manual would have been an hour.
- **Conventional commits + progressive committing.** Telling the model to commit per logical unit produced a clean `git log --oneline` (54 commits) that doubles as a changelog.
- **Catching its own mistakes.** When I pasted a Playwright timeout, Claude walked the relevant file and pointed at the actual stale-proxy bug without me leading the witness. The fix took one round-trip.

---

## When AI got in the way

Pattern: AI is calibrated to its training data, and 2026 has moved. Every entry below is a real bug from `notes/ai-bug.md`.

### 1 · Tooling silently failed and the model didn't notice

`npx shadcn@canary add form -y -o` exited 0 and wrote nothing — the canary registry entry for `form` was broken. Claude reported "added form.tsx" without verifying. `ls src/components/ui/` showed otherwise. Fix: I wrote `form.tsx` manually using the canonical shadcn pattern. **Lesson: after every CLI invocation, verify the file actually exists.**

### 2 · ESLint rule the model didn't know about (`react-hooks/set-state-in-effect`)

```tsx
useEffect(() => {
  if (!open) setContext("");
}, [open]);
```

Idiomatic in older React docs, **lint error** in modern React. Fix: replace with a `closeAndReset()` helper called from every code path that flips `open`. (Logged in `notes/ai-bug.md` under "set-state-in-effect".)

### 3 · dnd-kit `arrayMove` mistake (commit `063df00`)

The first board impl excluded the active task from the column before computing the over.id index. For intra-column moves, that produced a no-op splice — drag-by-one visually moved the card but committed the original order. Type-check passed, lint passed; only manual interaction caught it. Fix: special-case intra-column drags with `arrayMove(col, oldIndex, newIndex)` over the full column, indices computed from the same array.

**This is the canonical "AI generated something that typechecks and silently misbehaves" example.** Without manually dragging, the bug would have shipped.

### 4 · Tailwind utility that doesn't exist (`-inset-l-3`)

Model wrote `max-sm:before:-inset-l-3` for an asymmetric pseudo-element hit-area extension. Tailwind has `-inset-x-N` / `-inset-y-N` and individual `-left-N`, but **no** `-inset-l-N`. Tailwind silently drops unknown utilities — lint won't catch it. Fix: dropped the asymmetric trick, bumped the visible target on mobile (`size-5 max-sm:size-11`).

### 5 · shadcn dark-theme primary failed WCAG AA contrast

The scaffold's `--primary: oklch(0.625 …)` in dark mode against near-white text gave ~3.4 : 1 — axe reported a `color-contrast` violation. Fix: matched the dark-mode primary to the light-theme lightness (`0.541`). **Scaffold defaults are tuned for aesthetic punch, not accessibility.**

### 6 · `Promise.resolve` after a sync throw

```ts
create(input): Promise<Project> {
  const project = ProjectSchema.parse(input);  // throws sync
  // …
  return Promise.resolve(project);
}
```

Tests with `await expect(...).rejects.toBeInstanceOf(ZodError)` failed because the throw escaped synchronously. Fix: every repository method became `async`. Auto-wraps both value and throw paths. One-keyword change, two failing tests passed.

### 7 · Stale RHF proxy reads (the Playwright failure)

Described under "representative bug-fix prompt" above. The root cause — reading `form.formState.isValid` from a non-render context — is a v7 quirk the model didn't volunteer. It only surfaced when E2E started asserting on the "Saved" indicator. **Lesson: don't read `formState.*` from `setTimeout` / `watch` / `useEffect` callbacks. Use `schema.safeParse` instead.**

### 8 · Underscore-prefixed unused param wasn't silenced

`function handleDelete(_project: Project)` still tripped `no-unused-vars` because `eslint-config-next/typescript` doesn't set `argsIgnorePattern: "^_"`. **Convention ≠ rule.** Fix: drop the param until it's used; reintroduce with the real signature later.

---

## Things AI generated that I had to fix

Concise tally — same source, different framing:

| #   | What it generated                                | What broke                                           | Fix                                 |
| --- | ------------------------------------------------ | ---------------------------------------------------- | ----------------------------------- |
| 1   | `npx shadcn@canary add form` invocation          | Empty file silently                                  | Wrote `form.tsx` by hand            |
| 2   | `return Promise.resolve(parse(input))`           | Sync throw escapes the Promise                       | `async` on every method             |
| 3   | `function handleDelete(_project: Project)`       | `no-unused-vars` still flagged it                    | Drop param until used               |
| 4   | dnd-kit `handleDragEnd` excluding active item    | Intra-column drag-by-one no-op                       | `arrayMove` over full column        |
| 5   | `useEffect(() => { if (!open) setContext("") })` | `react-hooks/set-state-in-effect` lint error         | `closeAndReset()` handler           |
| 6   | Tailwind `max-sm:before:-inset-l-3`              | Unknown utility, silently dropped                    | Bump visible mobile target instead  |
| 7   | Scaffold dark-mode `--primary: oklch(0.625 …)`   | axe contrast violation                               | Matched lightness to light theme    |
| 8   | `if (!form.formState.isValid) return` in timer   | RHF v7 proxy returns stale `false`, save never fires | Drop the check; `safeParse` is gate |

A common thread: **lint and typecheck passed for 5 of these 8 bugs.** That's why every Chunk in the implementation plan has a manual-verification gate, not just "run the test suite."

---

## Final reflection

### Time

The first commit was at `16:10` on 2026-05-31; the last (before docs) at `23:18` — ~7 hours of focused build, with planning earlier. The plan's optimistic estimate was 22 hours of build time; the actual was about 8 with AI assistance, including ~2 hours of bug-hunting on the items above.

| Phase                                          | Estimate without AI | Actual with AI |
| ---------------------------------------------- | ------------------- | -------------- |
| Design doc + implementation plan               | 4 hrs               | 1.5 hrs        |
| Scaffold + tooling + design tokens             | 2 hrs               | 25 min         |
| Data layer + repository pattern + Vitest tests | 4 hrs               | 30 min         |
| Project CRUD (list, dialog, delete)            | 3 hrs               | 30 min         |
| Kanban board + drag-and-drop                   | 5 hrs               | 1 hr           |
| AI route + dialog + bulk insert                | 3 hrs               | 1 hr           |
| Task detail panel + sub-tasks                  | 3 hrs               | 45 min         |
| Polish (empty, error, skeleton, theme, anim)   | 4 hrs               | 1.5 hrs        |
| Responsive + a11y + perf                       | 3 hrs               | 30 min         |
| Playwright E2E happy path                      | 2 hrs               | 1 hr           |
| **Total build (excluding docs)**               | **33 hrs**          | **~8 hrs**     |

Honest multiplier: ~4× on greenfield work, dropping to maybe 1.5× on debugging the AI's own mistakes.

### Accuracy

Of 54 commits, 8 carried real bugs from AI-generated code. Of those:

- 3 were caught by lint/typecheck/tests (good).
- 5 were caught only by manual interaction or axe (bad — they would have shipped).

So the working accuracy of AI-generated code in this build was around **80%** correct on first generation, dropping to about **40%** for anything involving runtime behavior the type system can't express (drag-and-drop math, CSS class names, proxy-tracked state, async error paths). Categories where the model is reliably accurate: Zod schemas, TanStack Query setup, conventional commit messages, file structure, Tailwind utility names _that exist_.

### What I'd do differently next time

1. **Bake the verification gate into every prompt.** Phrase prompts as "implement X. Then run `npm test && npm run lint`. Then manually exercise Y. Report only after all three pass." Half the bugs above were "looks done, lint green, ships broken."
2. **Always verify CLI side effects with `ls` / `cat`.** The shadcn canary silent failure was a one-line `ls src/components/ui/form.tsx` away.
3. **Read the lint rule list before relying on conventions.** Underscore-prefix unused params and the `set-state-in-effect` rule both surprised me. Skim `eslint.config.mjs` once per project.
4. **For training-data-sensitive tech (Tailwind utilities, RHF proxies, dnd-kit math), name the version explicitly in the prompt and ask for citations.** "Tailwind v4 — what utilities exist for negative directional inset? Cite the docs." This shifts the model from generation to retrieval and catches confabulations earlier.
5. **For UI behavior, write the Playwright spec before the implementation.** The auto-save bug would have surfaced 4 hours earlier if the test came first. The Chunk I work order (E2E _last_) was wrong on this point.

The single biggest force-multiplier was the up-front planning. Every prompt referenced "Task N / §X of the implementation plan," which kept Claude on rails. Without the plan, every prompt would have been a debate about scope.
