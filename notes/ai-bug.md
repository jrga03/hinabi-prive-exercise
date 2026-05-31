# AI Bug & Fix Log

Running log of moments where AI-generated code was wrong, the bug, and the fix. Used as source material for `AI_WORKFLOW.md` at submission time.

Format per entry:

```
## Date - Short title

**Tool:** (Cursor Composer / Cursor Chat / Claude Code / Claude.ai)
**Model:** (Sonnet 4.6 / Opus 4.7 / etc.)
**Task:** what I was trying to do
**Prompt:** (verbatim)
**Generated output:** (snippet of the wrong code)
**Bug:** what was actually broken (behavior, error, mismatch with spec)
**Fix:** the follow-up prompt OR manual edit, with the corrected code
**Lesson:** what to prompt for next time to avoid this
```

---

## 2026-05-31 - shadcn canary form component shipped empty

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Add `form.tsx` to `src/components/ui/` via `npx shadcn@canary add form`.
**Prompt:** `npx shadcn@canary add form -y -o`
**Generated output:** shadcn ran and printed "Checking registry" — but no file was written. `shadcn view form` returned a registry entry with no file content. `ls src/components/ui/` confirmed no `form.tsx`.
**Bug:** shadcn canary 4.2.0-canary.0 has a missing/empty `form` component definition. Silent failure mode (exit 0, no error, no file).
**Fix:** Wrote `form.tsx` manually using the canonical shadcn pattern (FormProvider + Controller + FormItem/FormLabel/FormControl/FormDescription/FormMessage + useFormField hook). Skipped Radix `@radix-ui/react-label` and `@radix-ui/react-slot` since this shadcn version uses `@base-ui/react` instead — the form component itself doesn't need either, it just wraps `react-hook-form` and `Label`.
**Lesson:** When shadcn (or any CLI) appears to succeed silently with no file output, verify with `ls` before moving on. For canary/preview tooling, expect silent failure modes and have a fallback strategy.

---

## 2026-05-31 - Repository methods leaked sync ZodError, broke `.rejects` test matcher

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Implement `LocalStorageProjectRepository.create` so it returns `Promise<Project>` and the test `await expect(repo.create({ title: '' })).rejects.toBeInstanceOf(ZodError)` passes.
**Prompt:** Internal — generating Task 6 per implementation plan §14.2 with the rule "Every method returns a Promise (use Promise.resolve), even though localStorage is synchronous."
**Generated output:**

```ts
create(input: CreateProjectInput): Promise<Project> {
  const now = nowIso()
  const project: Project = ProjectSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  })
  // …
  return Promise.resolve(project)
}
```

**Bug:** `ProjectSchema.parse(...)` throws synchronously _before_ `Promise.resolve(...)` runs, so the function throws synchronously rather than returning a rejected promise. The test sees an unhandled throw at `repo.create(...)` and the `.rejects` matcher never engages. 2 of 19 Vitest cases failed with the actual ZodError surfaced as a test runner error, not a rejection.
**Fix:** Converted every repository method from `methodName(): Promise<X> { … return Promise.resolve(x) }` to `async methodName(): Promise<X> { … return x }`. Async functions auto-convert sync throws into rejected promises, so the failing tests passed without modification and the public contract is unchanged.
**Lesson:** "Use Promise.resolve to keep the contract" is correct for value-returning paths but doesn't cover throw paths. Prefer `async` on every repository method — it's a one-keyword change that handles both. When the prompt says "must return a Promise," translate that to "must be an async function" unless there's a specific reason not to.

---

## 2026-05-31 - Underscore-prefixed unused param still flagged by ESLint

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Stub a placeholder `handleDelete(project)` in `project-list.tsx` for Task 9 / 10 where the project arg would only be used once the dialog wired up later.
**Prompt:** Internal — generating the intermediate ProjectList state for the "verify between Tasks 8/9 and 10/11" gate.
**Generated output:**

```tsx
function handleDelete(_project: Project) {
  toast.info("Delete confirmation wires up next");
}
```

**Bug:** Underscore-prefixed `_project` was generated assuming ESLint's `no-unused-vars` would honor the leading underscore as an ignore signal. The project's `eslint.config.mjs` extends `eslint-config-next/typescript` without overriding `argsIgnorePattern`, so the default rule still flagged `_project` as unused. `npm run lint` reported the warning even though the prefix convention "looked right".
**Fix:** Two options were viable: (a) drop the parameter entirely while it's unused, or (b) add `argsIgnorePattern: "^_"` to the eslint config. Picked (a) for this intermediate state since the param gets reintroduced (and used) in Task 11. If the prefix convention is going to be repeated, configure the rule once.
**Lesson:** Don't assume `_foo` silences lint warnings — it's only a convention, and only works if the rule is configured for it. When generating stub code that will be filled in later, either (a) omit the param and add it back when used, or (b) check the linter's `no-unused-vars` config before relying on the underscore prefix.

---

## 2026-05-31 - dnd-kit handleDragEnd silently no-op'd intra-column drag-by-one

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Implement the Kanban board's `handleDragEnd` in `src/components/kanban/board.tsx` (Task 14 / §14.7) so dragging a task within a column reorders it.
**Prompt:** Internal — Task 14 implementation per the §14.7 spec, "build updates array from over.id position."
**Generated output:**

```ts
const targetCol = sortedColumn(cache, targetStatus, activeIdStr); // EXCLUDES active
const targetIndex = indexInColumn(targetCol, overIdStr) ?? targetCol.length;
const finalTargetCol = [...targetCol];
finalTargetCol.splice(targetIndex, 0, { ...dragged, status: targetStatus });
```

**Bug:** For intra-column drags (same source + target column), excluding the active task from the column before computing the over.id's index means: if the user drags task[0] down by one slot to land on task[1]'s position, `targetCol` (without active) is `[task[1], task[2]]`, so `indexInColumn(targetCol, task[1].id) === 0`. Splicing active at index 0 produces `[active, task[1], task[2]]` — i.e., the original order. The drag visually moved the card but the commit was a no-op. Only multi-position drags (over.id past task[1]) showed any change. Type-check passed; the bug only surfaced with manual drag interaction.
**Fix:** Special-case intra-column moves in `handleDragEnd` to use `arrayMove(col, oldIndex, newIndex)` from `@dnd-kit/sortable` over the **full** column (including active), with both indices computed from the same array. `arrayMove` handles both forward and backward swaps correctly. Cross-column logic was unchanged. Also switched the source-of-truth from the (potentially-mutated-by-onDragOver) cache to the pre-drag snapshot, so the final commit is computed deterministically regardless of onDragOver interim state.
**Lesson:** Whenever the dnd-kit handler computes index-based reorder, **either include the active item in the array on both sides of the index lookup, or use `arrayMove`/`arrayInsertAt`.** Mixing "exclude active" + "look up over.id index" only works for cross-column moves; for intra-column it silently no-ops the single-position swap, which is the most common drag the user will actually try. Verifying with `npm run typecheck && npm run lint` is not enough for dnd-kit — every reorder direction needs a manual drag test.

---

## 2026-05-31 - `useEffect` reset of local state tripped `react-hooks/set-state-in-effect`

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** In `src/components/ai/generate-dialog.tsx`, reset the `context` textarea to `""` whenever the dialog closes.
**Prompt:** Internal — Task 17 implementation, "On close, clear the optional context textarea."
**Generated output:**

```tsx
const [context, setContext] = useState("");

useEffect(() => {
  if (!open) setContext("");
}, [open]);
```

**Bug:** ESLint flagged `react-hooks/set-state-in-effect` — a newer React Hook rule that warns when state is updated as a _reaction to a prop change_ inside `useEffect`, because it forces an extra render and an avoidable layout pass. The lint blocked because the build pipeline treats this rule as an error. The "reset state when prop X changes" pattern was idiomatic in older React docs/training data; the recommendation now is to either (a) derive the value, (b) use a `key` prop to remount, or (c) reset in the same handler that flips the prop.
**Fix:** Replaced the effect with a `closeAndReset()` helper that the cancel button, success branch of `handleGenerate`, and the dialog's `onOpenChange={false}` branch all call. Reset and prop change happen in the same handler — no observer effect needed.

```tsx
function closeAndReset() {
  setContext("");
  onOpenChange(false);
}
```

**Lesson:** Whenever a model proposes `useEffect(() => { if (!propX) setLocal(initial) }, [propX])`, treat it as a smell. Either inline the reset in the handler that flips `propX`, or pass a `key` to force a remount. The "synchronize derived state in an effect" pattern dates a model's training data — modern React explicitly discourages it (rules-of-hooks added `set-state-in-effect` as a lint error). The fix is almost always to push state ownership up to the same handler, not down into an observer.
