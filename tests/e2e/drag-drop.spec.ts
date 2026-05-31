import { test, expect, type Locator, type Page } from "@playwright/test";

// Reproduces and locks in fixes for two reported intra-column drag bugs:
//
//   (a) Dropping a card at the FIRST position doesn't persist.
//   (b) Dropping a card at the SECOND position lands it at the FIRST instead.
//
// dnd-kit uses pointer events with a 4px activation threshold, so HTML5 drag
// helpers don't apply — we drive the mouse manually, mirroring the helper used
// in tests/e2e/happy-path.spec.ts.

const PROJECT_TITLE = "Drag Test Project";
const TASK_NAMES = ["Alpha", "Bravo", "Charlie"] as const;

async function seedThreeTasks(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create a new project" });
  await projectDialog.getByPlaceholder("e.g. Q3 marketing launch").fill(PROJECT_TITLE);
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).toBeHidden();
  await page.getByRole("link", { name: `Open ${PROJECT_TITLE}` }).click();
  await expect(page.getByRole("heading", { name: PROJECT_TITLE, level: 1 })).toBeVisible();

  const todoColumn = page.getByRole("region", { name: "To Do column" });
  for (const name of TASK_NAMES) {
    await todoColumn.getByRole("button", { name: "Add task to To Do" }).click();
    const input = todoColumn.getByRole("textbox", { name: "New task title" });
    await input.fill(name);
    await input.press("Enter");
    await expect(
      todoColumn.getByRole("button", { name: new RegExp(`^Task: ${name}`) })
    ).toBeVisible();
  }
  return todoColumn;
}

async function dragCardOnto(
  page: Page,
  source: Locator,
  target: Locator,
  where: "above" | "below"
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("missing bounding box");
  const fromX = sourceBox.x + sourceBox.width / 2;
  const fromY = sourceBox.y + sourceBox.height / 2;
  const toX = targetBox.x + targetBox.width / 2;
  // Land in the top third for "above" and the bottom third for "below" so the
  // isBelowOverItem decision is unambiguous.
  const toY =
    where === "above" ? targetBox.y + targetBox.height * 0.2 : targetBox.y + targetBox.height * 0.8;

  await source.scrollIntoViewIfNeeded();
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Cross the 4px activation distance first.
  await page.mouse.move(fromX + 10, fromY, { steps: 5 });
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
  }
  await page.mouse.up();
}

async function readOrder(column: Locator): Promise<string[]> {
  const names = await column.getByRole("button", { name: /^Task: / }).allTextContents();
  // Each card's accessible text starts with the title; first line is the title.
  return names.map((t) => t.trim().split("\n")[0]);
}

test.describe("Kanban intra-column drag", () => {
  test("drag the last card to the FIRST position", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const cards = todoColumn.getByRole("button", { name: /^Task: / });
    await expect(cards).toHaveCount(3);

    // Initial order: Alpha, Bravo, Charlie.
    const initial = await readOrder(todoColumn);
    expect(initial).toEqual(["Alpha", "Bravo", "Charlie"]);

    const charlie = todoColumn.getByRole("button", { name: /^Task: Charlie/ });
    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });
    await dragCardOnto(page, charlie, alpha, "above");

    // Charlie should now be at position 1.
    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Charlie", "Alpha", "Bravo"]);

    // Persistence: reload and confirm the new order survived the localStorage
    // round trip.
    await page.reload();
    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  test("drag the last card to the SECOND position", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const initial = await readOrder(todoColumn);
    expect(initial).toEqual(["Alpha", "Bravo", "Charlie"]);

    const charlie = todoColumn.getByRole("button", { name: /^Task: Charlie/ });
    const bravo = todoColumn.getByRole("button", { name: /^Task: Bravo/ });
    // Drop on Bravo's TOP half so Charlie ends up at index 1 (= position 2).
    await dragCardOnto(page, charlie, bravo, "above");

    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Alpha", "Charlie", "Bravo"]);
  });

  test("drag the first card DOWN by one position", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);

    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });
    const bravo = todoColumn.getByRole("button", { name: /^Task: Bravo/ });
    // Drop on Bravo's BOTTOM half so Alpha lands AFTER Bravo (position 2).
    await dragCardOnto(page, alpha, bravo, "below");

    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  test("drop in the GAP above the first card lands at position 1", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const charlie = todoColumn.getByRole("button", { name: /^Task: Charlie/ });
    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });

    const sourceBox = await charlie.boundingBox();
    const alphaBox = await alpha.boundingBox();
    if (!sourceBox || !alphaBox) throw new Error("missing box");
    const fromX = sourceBox.x + sourceBox.width / 2;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const toX = alphaBox.x + alphaBox.width / 2;
    // Aim 3px above Alpha's top — inside the column's p-1 padding but not over
    // any card. This is where the column drop zone wins closestCorners and the
    // old code incorrectly mapped to "append to end".
    const toY = alphaBox.y - 3;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + 10, fromY, { steps: 5 });
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
    }
    await page.mouse.up();

    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  test("drag a card to an empty In Progress column", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });
    const inProgressColumn = page.getByRole("region", { name: "In Progress column" });

    // Drop in the EMPTY column. Aim for the empty-state placeholder text rather
    // than the column's geometric center (which the happy-path spec uses).
    const sourceBox = await alpha.boundingBox();
    const placeholder = inProgressColumn.getByText(/Pull from To Do/);
    const targetBox = await placeholder.boundingBox();
    if (!sourceBox || !targetBox) throw new Error("missing box");
    const fromX = sourceBox.x + sourceBox.width / 2;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const toX = targetBox.x + targetBox.width / 2;
    const toY = targetBox.y + targetBox.height / 2;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + 10, fromY, { steps: 5 });
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
    }
    await page.mouse.up();

    await expect(inProgressColumn.getByRole("button", { name: /^Task: Alpha/ })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("drag a card NEAR the bottom of an empty column", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });
    const inProgressColumn = page.getByRole("region", { name: "In Progress column" });

    // Aim 4px below the bottom of the empty droppable — outside the column's
    // visible drop zone. This is the failure mode the user reported: the
    // cursor isn't precisely inside the droppable rect, so pointerWithin
    // returns nothing and closestCorners picks a To Do card.
    const sourceBox = await alpha.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();
    if (!sourceBox || !targetBox) throw new Error("missing box");
    const fromX = sourceBox.x + sourceBox.width / 2;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const toX = targetBox.x + targetBox.width / 2;
    const toY = targetBox.y + targetBox.height + 8;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + 10, fromY, { steps: 5 });
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
    }
    await page.mouse.up();

    await expect(inProgressColumn.getByRole("button", { name: /^Task: Alpha/ })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("drop in the GAP between cards lands between them", async ({ page }) => {
    const todoColumn = await seedThreeTasks(page);
    const charlie = todoColumn.getByRole("button", { name: /^Task: Charlie/ });
    const alpha = todoColumn.getByRole("button", { name: /^Task: Alpha/ });
    const bravo = todoColumn.getByRole("button", { name: /^Task: Bravo/ });

    const sourceBox = await charlie.boundingBox();
    const alphaBox = await alpha.boundingBox();
    const bravoBox = await bravo.boundingBox();
    if (!sourceBox || !alphaBox || !bravoBox) throw new Error("missing box");
    const fromX = sourceBox.x + sourceBox.width / 2;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const toX = alphaBox.x + alphaBox.width / 2;
    // Land in the 12px space-y-3 gap between Alpha and Bravo — not inside any
    // card, but inside the column drop zone.
    const toY = (alphaBox.y + alphaBox.height + bravoBox.y) / 2;

    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(fromX + 10, fromY, { steps: 5 });
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(fromX + 10 + (toX - fromX - 10) * t, fromY + (toY - fromY) * t);
    }
    await page.mouse.up();

    await expect.poll(async () => readOrder(todoColumn)).toEqual(["Alpha", "Charlie", "Bravo"]);
  });
});
