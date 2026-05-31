import { test, expect, type Page } from "@playwright/test";

// The /api/ai/generate-tasks route is stubbed so the spec is deterministic and
// doesn't burn the Gemini quota on CI. The real route streams text/plain JSON
// chunks (see src/app/api/ai/generate-tasks/route.ts); we mirror that shape so
// the client-side stream reader exercises the same parse path it does in prod.
// The body matches the Zod schema at src/lib/ai/schema.ts (AIResponseSchema) —
// exactly 5 tasks, each with a valid category from TASK_CATEGORIES.

const PROJECT_TITLE = "E2E Test Project";

const STUBBED_TASKS = [
  { title: "Define the launch goal", category: "strategy" as const },
  { title: "Draft brand visuals", category: "design" as const },
  { title: "Scaffold project repo", category: "engineering" as const },
  { title: "Outline launch email", category: "marketing" as const },
  { title: "Set up analytics", category: "operations" as const },
];

async function stubGenerate(page: Page) {
  await page.route("**/api/ai/generate-tasks", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: JSON.stringify({ tasks: STUBBED_TASKS }),
    });
  });
}

test.describe("Happy path", () => {
  test("create → magic generate → drag → edit → sub-task → delete", async ({ page }) => {
    await stubGenerate(page);

    // 1. Empty state CTA is the centered card, not the header button.
    await page.goto("/");
    const emptyCta = page.getByRole("button", { name: "Create your first project" });
    await expect(emptyCta).toBeVisible();
    await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);

    // 2. Create the project via the empty-state CTA.
    // shadcn's FormLabel here renders as a <div> (not <label>), so
    // getByLabel("Title") doesn't bind — use the placeholder instead.
    await emptyCta.click();
    const projectDialog = page.getByRole("dialog", { name: "Create a new project" });
    await projectDialog.getByPlaceholder("e.g. Q3 marketing launch").fill(PROJECT_TITLE);
    await projectDialog.getByRole("button", { name: "Create project" }).click();

    // The dialog closes back on /. Open the new project's board.
    await expect(projectDialog).toBeHidden();
    await page.getByRole("link", { name: `Open ${PROJECT_TITLE}` }).click();
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("heading", { name: PROJECT_TITLE, level: 1 })).toBeVisible();

    // 3. Magic Generate — uses the stubbed response.
    await page.getByRole("button", { name: "Magic Generate" }).click();
    await page.getByRole("button", { name: "Generate 5 tasks" }).click();

    const todoColumn = page.getByRole("region", { name: "To Do column" });
    const todoTasks = todoColumn.getByRole("button", { name: /^Task:/ });
    await expect(todoTasks.first()).toBeVisible({ timeout: 10_000 });
    // Plan §31 asks for "≥ 1" — the stub returns exactly 5, so assert ≥ 1
    // to stay tolerant of any future schema change.
    await expect.poll(async () => await todoTasks.count()).toBeGreaterThanOrEqual(1);

    // 4. Drag the first To Do card into the In Progress column.
    // dnd-kit uses MouseSensor (pointer events), NOT HTML5 drag — so
    // page.locator(...).dragTo(...) does NOT work here. We simulate a real
    // mouse drag: mousedown, move past the 4px activation threshold, then
    // glide to the target in small steps so onDragOver fires repeatedly.
    const firstTodo = todoColumn.getByRole("button", {
      name: new RegExp(`^Task: ${STUBBED_TASKS[0].title}`),
    });
    const inProgressColumn = page.getByRole("region", { name: "In Progress column" });

    await firstTodo.scrollIntoViewIfNeeded();
    await firstTodo.hover();
    const sourceBox = await firstTodo.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();
    if (!sourceBox || !targetBox) throw new Error("drag boxes unavailable");
    const fromX = sourceBox.x + sourceBox.width / 2;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const toX = targetBox.x + targetBox.width / 2;
    const toY = targetBox.y + targetBox.height / 2;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    // Cross the MouseSensor activation distance (>4px) with an explicit small
    // move first; dnd-kit only kicks the drag state in once that threshold is
    // exceeded. Then glide to the target in many small steps so onDragOver
    // fires repeatedly and the collision detector has time to land.
    await page.mouse.move(fromX + 10, fromY, { steps: 5 });
    const steps = 25;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
    }
    await page.mouse.up();

    await expect(
      inProgressColumn.getByRole("button", {
        name: new RegExp(`^Task: ${STUBBED_TASKS[0].title}`),
      })
    ).toBeVisible({ timeout: 5_000 });

    // 5. Open the card, edit the title, wait for "Saved", close with Escape.
    await inProgressColumn
      .getByRole("button", { name: new RegExp(`^Task: ${STUBBED_TASKS[0].title}`) })
      .click();
    const titleInput = page.getByPlaceholder("What needs doing?");
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue(STUBBED_TASKS[0].title);

    // Use real keystrokes — locator.fill() would short-circuit through the
    // value setter and the form would still update, but typing makes the flow
    // closer to what a user actually does.
    const editedTitle = `${STUBBED_TASKS[0].title} (edited)`;
    await titleInput.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" (edited)", { delay: 30 });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(titleInput).toBeHidden();

    // 6. Re-open and add a sub-task.
    await inProgressColumn
      .getByRole("button", { name: new RegExp(`^Task: ${editedTitle.replace(/[()]/g, "\\$&")}`) })
      .click();
    await page.getByRole("button", { name: "Add sub-task" }).click();
    const subtaskInput = page.getByRole("textbox", { name: "New sub-task title" });
    await subtaskInput.fill("Draft the messaging hook");
    await subtaskInput.press("Enter");
    await expect(page.getByRole("button", { name: "Draft the messaging hook" })).toBeVisible();
    await page.keyboard.press("Escape");

    // 7. Open the project's Actions menu → Delete → confirm.
    await page.getByRole("button", { name: `Actions for ${PROJECT_TITLE}` }).click();
    await page.getByRole("menuitem", { name: "Delete project" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();

    // Back on /, empty state is visible again.
    await expect(page.getByRole("button", { name: "Create your first project" })).toBeVisible({
      timeout: 5_000,
    });
  });
});
