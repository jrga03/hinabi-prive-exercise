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

---

## 2026-05-31 - Invented Tailwind class `-inset-l-3`

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Extend the sub-task circle toggle's pointer hit area to 44 × 44 on mobile without changing the visible icon size.
**Prompt:** Internal — Chunk H Task 28, "touch targets ≥ 44px on every clickable", initial attempt used a `:before` pseudo-element to extend the hit area only on the left + vertical axis (so the rightward extension wouldn't overlap the adjacent task-title button's hit area).
**Generated output:**

```tsx
className =
  "... before:absolute before:content-[''] max-sm:before:-inset-y-3 max-sm:before:-inset-l-3";
```

**Bug:** `-inset-l-3` is not a valid Tailwind utility. Tailwind has `-inset-x-N` / `-inset-y-N` (both sides) and individual `-left-N`, `-right-N`, `-top-N`, `-bottom-N` — but **no** `-inset-l-N` / `-inset-r-N`. Tailwind silently dropped it from the generated CSS; lint and typecheck passed (the JSX is just a string). Visually nothing extended on mobile.
**Fix:** Abandoned the asymmetric pseudo-element approach (the right-edge overlap with the adjacent title button was a UX risk anyway). Scaled the toggle to `size-5 max-sm:size-11` and the inner icon to `size-4 max-sm:size-5`, then matched the row title button with `max-sm:min-h-11 max-sm:py-2` so both touch targets fill the row symmetrically.

```tsx
<button className="size-5 max-sm:size-11 ... ...">
  {done ? (
    <CircleCheckBig className="size-4 max-sm:size-5 ..." />
  ) : (
    <Circle className="size-4 max-sm:size-5" />
  )}
</button>
```

**Lesson:** Tailwind's directional inset utilities are `-{side}-{n}` (e.g., `-left-3`), not `-inset-{side}-{n}`. When extending a pointer-hit area asymmetrically, prefer the individual side classes and verify the generated CSS in the browser before assuming the layout changed — Tailwind silently drops unknown utilities, so lint won't catch the typo. Better still, when the extension would overlap with a sibling's hit area, bump the visible target on mobile instead of cheating with a pseudo-element.

---

## 2026-05-31 - shadcn default dark `--primary` failed AA contrast on the New project button

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Chunk H Task 29 — axe-core a11y scan across `/` and `/projects/:id` in light + dark mode.
**Prompt:** Internal — added an axe-core injection step to the Playwright responsive smoke and ran on both themes.
**Generated output:** axe reported one serious violation in dark mode: `color-contrast` on `.text-primary-foreground` (the "New project" button label). The default shadcn dark theme ships `--primary: oklch(0.625 0.281 293.009)` (lighter violet) against `--primary-foreground: oklch(0.985 0 0)` (near-white). Contrast ratio computed at ~3.4 : 1 — fails WCAG AA 4.5 : 1 for normal text.
**Bug:** Inherited the dark theme palette wholesale from the shadcn canary scaffold without checking that the _lighter_ dark-mode primary (a common dark-theme convention so the button "pops" against the dark background) still meets AA with the near-white label. Light theme passed (`oklch(0.541)` vs `oklch(0.985)` ≈ 5.4 : 1).
**Fix:** Reduced the dark-mode `--primary` lightness from `0.625` to `0.541` (same as light theme), and matched `--ring` and `--sidebar-primary*` so focus rings stay consistent. Re-ran axe — both themes now report 0 violations on both routes.

```css
.dark {
  --primary: oklch(0.541 0.281 293.009);
  /* --primary-foreground unchanged at oklch(0.985 0 0) */
  --ring: oklch(0.541 0.281 293.009);
  --sidebar-primary: oklch(0.541 0.281 293.009);
  --sidebar-ring: oklch(0.541 0.281 293.009);
}
```

**Lesson:** Default shadcn dark-mode palettes are tuned for aesthetic punch, not WCAG. Always run axe (or a contrast checker) against _both_ themes before shipping. The trap is the "lighter primary in dark mode for visual energy" convention — it looks great but tends to fail AA against white text. Either darken the primary back to the light-theme value (consistent, safer) or swap to a darker foreground; don't trust the scaffold defaults.

---

## 2026-05-31 - Task detail panel auto-save silently dead because `formState.isValid` was unreliable

**Tool:** Cursor (Composer) — original implementation
**Model:** Claude Sonnet 4.6
**Task:** Detail panel auto-save with debounced `form.watch` subscriber.
**Prompt:** Internal — "debounce 500 ms, then if the form is valid persist a diff patch via the update mutation."
**Generated output:**

```ts
const sub = form.watch((values, { type }) => {
  if (type !== "change") return;
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    if (!form.formState.isValid) return;   // <-- always false
    const safeValues = FormSchema.safeParse(values);
    if (!safeValues.success) return;
    ...
    updateTask.mutate(...);
  }, 500);
});
```

**Bug:** Surfaced when wiring the Playwright happy-path: every keystroke fired the watch subscriber, the debounce timer ran, `safeParse` passed, but `form.formState.isValid` returned `false` and the mutation was skipped. The "Saved" indicator never appeared. RHF v7's `formState` is a Proxy that only computes a given field (e.g., `isValid`) when something subscribes to it _during render_. Since `isValid` was only read inside the timer callback — never destructured at render time — the proxy never set up the tracker, and the value stayed at its initial `false`.

The bug was invisible during manual click-through because nobody had explicitly waited for the "Saved" pill to appear; the form values still update in the local React state, so an edit "looked" like it worked until the panel was closed and the cache reload restored the old title.

**Fix:** Removed the `formState.isValid` check entirely. `safeParse(values)` already runs the full Zod schema and is the authoritative validity gate; the `isValid` read was redundant _and_ wrong. Added a comment so the next person doesn't put it back.

```ts
debounceRef.current = setTimeout(() => {
  // safeParse is the authoritative validity gate. We deliberately do
  // NOT read form.formState.isValid here — RHF v7's proxy only tracks
  // state fields that are accessed during render, so reading isValid
  // from this callback returns a stale `false` and silently blocks
  // every save.
  const safeValues = FormSchema.safeParse(values);
  if (!safeValues.success) return;
  ...
}, 500);
```

**Lesson:** Don't read `form.formState.*` from inside a `setTimeout`/`watch`/`useEffect` callback unless you _also_ destructure that field during render. The proxy's "track on access" model means the value you get from a non-render context can be stale forever. When you already have the values in hand, validate them directly with the schema — that's authoritative and doesn't depend on RHF's render-tracking. Generally: any "if (X) bail" guard in a callback that depends on RHF's `formState` should be considered suspect until proven correct.

---

## 2026-06-01 - shadcn `<SelectValue />` rendered the raw value on @base-ui/react

**Tool:** Cursor (Composer)
**Model:** Claude Sonnet 4.6
**Task:** Status + Category Select in the task detail panel.
**Prompt:** Internal — Task 16, "render the selected item's label in the trigger." Borrowed the canonical shadcn pattern wholesale (`<SelectTrigger><SelectValue /></SelectTrigger>`).
**Generated output:**

```tsx
<Select value={field.value} onValueChange={(value) => field.onChange(value)}>
  <SelectTrigger className="w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {COLUMN_ORDER.map((status) => (
        <SelectItem key={status} value={status}>
          <span
            aria-hidden
            className={cn("inline-block size-2 rounded-full", COLUMN_META[status].accent)}
          />
          <span>{COLUMN_META[status].label}</span>
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>
```

**Bug:** The trigger rendered the raw value — `in_progress`, `__none__` — instead of "In Progress" or "No category". The shadcn pattern works on Radix because `<Select.Value>` auto-maps to the active item's children. The shadcn-canary in this repo wraps `@base-ui/react`, where `<Select.Value>` defaults to `resolveSelectedLabel(value, items, itemToStringLabel)` — and without an `items` prop on `<Select.Root>` or a `children` render function, that resolver falls back to `stringifyAsLabel(value)`, which just returns the string-coerced value. User-facing result: dropdown labels look broken, and a reviewer mistakes the select for non-functional.
**Fix:** Pass a render function to `<SelectValue>` that maps the value back to the rich label (dot + text). The render fn lives where the labels do (already imported from `COLUMN_META` / `CATEGORY_META`), so the mapping stays a single source of truth.

```tsx
<SelectValue>
  {(value: unknown) => {
    const meta = typeof value === "string" ? COLUMN_META[value as TaskStatus] : undefined;
    if (!meta) return null;
    return (
      <>
        <span aria-hidden className={cn("inline-block size-2 rounded-full", meta.accent)} />
        <span>{meta.label}</span>
      </>
    );
  }}
</SelectValue>
```

**Lesson:** When porting a shadcn pattern across primitive backends (Radix → @base-ui/react, in this case), do NOT assume the namesake components have identical defaults. `<Select.Value>` in particular has a different rendering contract: Base UI requires either an `items` prop on the Root or a `children` render fn on the Value; Radix doesn't. Any time a primitive sub-component renders its OWN content (not just children you pass it), check the source-of-truth render path in `node_modules/<primitive>/`. Don't trust that the visual hierarchy alone matches.

---

## 2026-06-01 - Debounced auto-save cancelled on panel close — typing then escaping lost the edit

**Tool:** Cursor (Composer)
**Model:** Claude Sonnet 4.6
**Task:** Task detail panel's auto-save: debounce 500 ms after each keystroke, then persist via the update mutation.
**Prompt:** Internal — Task 16, "On unmount clean up the debounce timer." (Reasonable on its face.)
**Generated output:**

```tsx
useEffect(
  () => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  },
  []
);
```

**Bug:** The cleanup runs when the sheet closes. If the user typed within the last 500 ms (e.g. typed a few characters then hit Escape), the debounce timer is _cancelled before it fires_ — the mutation never runs and the edit is silently lost. The existing happy-path E2E missed it because it explicitly waits for the "Saved" indicator before closing the sheet, which gives the timer 500 ms+ to fire. The user reported the bug only after manual click-through with realistic timing: "I cannot edit a card." The status/category Selects appeared to "work" only because the user paused on the popover long enough for the debounce to expire.
**Fix:** Replace "cancel the timer on unmount" with "FLUSH the timer on unmount and on task switch." Capture the saver closure at schedule time (so it persists against the task the user was editing, not whichever task is currently mounted), store it in a ref, and call it from the cleanup. The mutation is fire-and-forget from react-query — it doesn't need the component to stay mounted to commit.

```tsx
const pendingSaveRef = useRef<(() => void) | null>(null);

useEffect(() => {
  const sub = form.watch((values, { type }) => {
    if (type !== "change") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const targetTaskId = taskRef.current.id;
    const baseline = taskRef.current;
    const performSave = () => {
      pendingSaveRef.current = null;
      debounceRef.current = null;
      const safeValues = FormSchema.safeParse(values);
      if (!safeValues.success) return;
      const patch = buildPatch(safeValues.data, baseline);
      if (Object.keys(patch).length === 0) return;
      updateTask.mutate({ id: targetTaskId, projectId, patch }, { ... });
    };
    pendingSaveRef.current = performSave;
    debounceRef.current = setTimeout(performSave, 500);
  });
  return () => sub.unsubscribe();
}, [form, projectId, updateTask]);

useEffect(
  () => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pendingSaveRef.current?.();
  },
  [task.id]
);
```

**Lesson:** When a component's responsibility is "persist pending state to a side effect," the unmount cleanup is rarely "cancel the side effect." It's almost always "flush the side effect, _then_ cancel." If the test only proves the happy-path-with-waiting works, it doesn't prove the close-fast-during-edit path works — and that close-fast path is the one users actually exercise. The structural fix is to capture the saver as a `() => void` snapshot and call it from cleanup; the cleanup never needs to peek at current values. Bug class: any debounced or throttled side effect whose timer is cleared in cleanup, anywhere.

---

## 2026-06-01 - dnd-kit closestCorners let the column drop zone win, "drop at position 2 lands at position 1"

**Tool:** Cursor (Composer)
**Model:** Claude Sonnet 4.6
**Task:** Custom collision detection wasn't on the original spec — the plan said use `closestCorners` and call it a day. The bug only surfaced once a user dragged with imprecise targeting (i.e. dropping in the 12 px gap between cards, not directly onto a card).
**Prompt:** Internal — Task 14 / §14.7, "`<DndContext collisionDetection={closestCorners}>`."
**Generated output:** Just `collisionDetection={closestCorners}` and a `handleDragEnd` that read `over.id` directly (`arrayMove(col, oldIndex, col.findIndex(t => t.id === overIdStr))`).
**Bug:** Two compound failures:

1. **closestCorners ties get resolved unpredictably** between a card and the column drop zone (a `useDroppable` that wraps every column for empty-state drops). When the cursor sits in the gap between cards, the column's top corner and the nearby card's bottom corner are equidistant — closestCorners often returns the column, then handleDragEnd's `isColumnDropId` branch maps that to "append to end," producing a no-op when the dragged card was already at the end and a wrong-position move otherwise.
2. **No `isBelowOverItem` direction check.** Even when closestCorners DID return a card, `arrayMove(col, oldIdx, overIdx)` always inserts the active at `overIdx` — i.e., _above_ the over card. If the user drops on the lower half of a card, intending "place below," the active still lands above. Reproduced by Playwright: dragging Charlie onto the gap between Alpha and Bravo (intending position 2) produced `[Charlie, Alpha, Bravo]` instead of `[Alpha, Charlie, Bravo]`.

Type-check and lint passed. The Playwright happy-path passed because it dragged into the CENTER of an empty target column, which has no card to pick over.
**Fix:** Two parts.

1. **Custom collision detection that prefers cards under the pointer:**

```tsx
const collisionDetection = useCallback<CollisionDetection>((args) => {
  const inside = pointerWithin(args);
  const insideCard = inside.filter((c) => !isColumnDropId(String(c.id)));
  if (insideCard.length > 0) return insideCard;

  const insideColumn = inside.find((c) => isColumnDropId(String(c.id)));
  if (insideColumn) {
    const targetColumnId = String(insideColumn.id);
    const corners = closestCorners(args);
    const sameColumnCards = corners.filter((c) => {
      if (isColumnDropId(String(c.id))) return false;
      const sortable = (
        c.data?.droppableContainer?.data?.current as
          | { sortable?: { containerId?: string } }
          | undefined
      )?.sortable;
      return sortable?.containerId === targetColumnId;
    });
    if (sameColumnCards.length > 0) return sameColumnCards;
    return [insideColumn];
  }

  return closestCorners(args);
}, []);
```

The card-filter on `closestCorners` must be scoped to the column whose drop zone the pointer is over — otherwise cross-column drops onto an EMPTY column pull cards from the source column (regression I caught with the happy-path spec on the first revision of this fix).

2. **`isBelowOverItem` for insert position:**

```tsx
const overRect = over.rect;
const activeRect = active.rect.current.translated;
const isBelowOverItem =
  activeRect != null &&
  overRect != null &&
  activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
const insertAt = overIdx + (isBelowOverItem ? 1 : 0);
```

Combined with a unified "remove active, splice insert" pattern, this handles all four intra-column scenarios (above/below × forward/backward drag) plus the empty-column cross-column case.

**Lesson:** dnd-kit's `closestCorners` is the right default for kanban-shaped UIs, but it doesn't know which droppables should "win" when corners tie. Whenever you have both card-level sortables and column-level drop zones in the same context, you need a custom `collisionDetection` that resolves the tie deliberately. AND: the "what index does over.id mean" question requires direction (above vs below the over card's center). Skipping `isBelowOverItem` means half your drops are wrong by one slot — and the visual sortable shift hides it until you actually persist and reload. Bug class: any DnD pattern with multiple-layer droppables + an ordered list.

---

## 2026-06-01 - Cross-column drop into empty column became a no-op because the active item won the collision

**Tool:** Claude Code (terminal CLI)
**Model:** Opus 4.7
**Task:** Refine the custom `collisionDetection` from the previous fix so cross-column drops onto an EMPTY column actually land there.
**Prompt:** Internal — Bug 1 follow-up. The user reported "I cannot transfer a card to an empty board" right after the first collision-detection patch landed.
**Generated output:** The first revision of the card-first detector:

```tsx
const insideColumn = inside.find((c) => isColumnDropId(String(c.id)));
if (insideColumn) {
  const targetColumnId = String(insideColumn.id);
  const corners = closestCorners(args);
  const sameColumnCards = corners.filter((c) => {
    if (isColumnDropId(String(c.id))) return false;
    const sortable = (
      c.data?.droppableContainer?.data?.current as
        | { sortable?: { containerId?: string } }
        | undefined
    )?.sortable;
    return sortable?.containerId === targetColumnId;
  });
  if (sameColumnCards.length > 0) return sameColumnCards;
  return [insideColumn];
}
```

**Bug:** `closestCorners` does NOT exclude the active item from its candidates — and `handleDragOver` had already moved the active task into the target column's cache (and therefore its SortableContext, and therefore its `sortable.containerId`) by the time the drag-end collision was computed. The filter "cards in target column" returned the active card itself. `over.id === active.id` → handleDragEnd treats the drop as a no-op (active is "over itself") and rolls back to the snapshot. The card visually returned to its source column. Reproduced in Playwright by aiming at the empty-state placeholder inside an empty In Progress column; the browser console logged `over.id === active.id` at drop time.
**Fix:** Explicitly filter the active item out of EVERY collision-detection branch:

```tsx
const activeIdStr = String(args.active.id);
const inside = pointerWithin(args).filter((c) => String(c.id) !== activeIdStr);
...
const corners = closestCorners(args).filter((c) => String(c.id) !== activeIdStr);
```

With the active excluded, `sameColumnCards` is empty for an empty target column → we fall through to `return [insideColumn]` and `over.id` becomes the column drop zone. handleDragEnd's column-drop branch then inserts the card.

**Lesson:** Any time you compose dnd-kit collision algorithms, REMEMBER that some of them (like `closestCorners`, `pointerWithin`, `rectIntersection`) include the active item in their candidates by default — they treat "self" the same as any other droppable. The algorithms that exclude active (like sortable's internal handlers) do so explicitly. When you write a custom `collisionDetection`, filter `c.id === active.id` out as the first step of every branch, otherwise you'll occasionally return "the active is over itself" and the drop silently no-ops. This compounds with cache-mutating `handleDragOver` patterns where the active's containerId changes mid-drag — a class of bug that pure type-checking can never catch.
