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

**Bug:** `ProjectSchema.parse(...)` throws synchronously *before* `Promise.resolve(...)` runs, so the function throws synchronously rather than returning a rejected promise. The test sees an unhandled throw at `repo.create(...)` and the `.rejects` matcher never engages. 2 of 19 Vitest cases failed with the actual ZodError surfaced as a test runner error, not a rejection.
**Fix:** Converted every repository method from `methodName(): Promise<X> { … return Promise.resolve(x) }` to `async methodName(): Promise<X> { … return x }`. Async functions auto-convert sync throws into rejected promises, so the failing tests passed without modification and the public contract is unchanged.
**Lesson:** "Use Promise.resolve to keep the contract" is correct for value-returning paths but doesn't cover throw paths. Prefer `async` on every repository method — it's a one-keyword change that handles both. When the prompt says "must return a Promise," translate that to "must be an async function" unless there's a specific reason not to.

---

(Add more entries as the build progresses.)
