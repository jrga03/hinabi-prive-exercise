import { test, expect, type Page } from "@playwright/test";

// Focused spec for the task detail panel's auto-save behavior on text fields.
// The existing happy-path covers the title field but waits for "Saved" before
// closing — which masks the real-world bug where the user types and closes the
// panel within the 500ms debounce window, cancelling the pending save.

const PROJECT_TITLE = "Edit Test Project";
const TASK_TITLE = "Original task title";

async function seedProjectAndTask(page: Page) {
  await page.goto("/");

  // Create the project via the empty-state CTA.
  await page.getByRole("button", { name: "Create your first project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create a new project" });
  await projectDialog.getByPlaceholder("e.g. Q3 marketing launch").fill(PROJECT_TITLE);
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).toBeHidden();

  // Open the project's board.
  await page.getByRole("link", { name: `Open ${PROJECT_TITLE}` }).click();
  await expect(page.getByRole("heading", { name: PROJECT_TITLE, level: 1 })).toBeVisible();

  // Seed exactly one task via the column's inline add (no AI needed).
  const todoColumn = page.getByRole("region", { name: "To Do column" });
  await todoColumn.getByRole("button", { name: "Add task to To Do" }).click();
  const inlineInput = todoColumn.getByRole("textbox", { name: "New task title" });
  await inlineInput.fill(TASK_TITLE);
  await inlineInput.press("Enter");
  const taskCard = todoColumn.getByRole("button", { name: new RegExp(`^Task: ${TASK_TITLE}`) });
  await expect(taskCard).toBeVisible();
  return taskCard;
}

test.describe("Task detail auto-save", () => {
  test("title edits persist when the panel is closed quickly", async ({ page }) => {
    const taskCard = await seedProjectAndTask(page);

    // Open the detail panel, type, then close FAST — within the 500ms debounce.
    await taskCard.click();
    const titleInput = page.getByPlaceholder("What needs doing?");
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue(TASK_TITLE);

    await titleInput.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" (edited)", { delay: 10 });
    // Close immediately. The current implementation would lose the edit because
    // the unmount cleanup clears the pending debounce.
    await page.keyboard.press("Escape");
    await expect(titleInput).toBeHidden();

    // Re-open the task. The card should reflect the edited title.
    await page
      .getByRole("button", { name: new RegExp(`^Task: ${TASK_TITLE} \\(edited\\)`) })
      .click();
    await expect(page.getByPlaceholder("What needs doing?")).toHaveValue(`${TASK_TITLE} (edited)`);
  });

  test("description edits persist when the panel is closed quickly", async ({ page }) => {
    const taskCard = await seedProjectAndTask(page);

    await taskCard.click();
    const description = page.getByPlaceholder("Notes, acceptance criteria, links…");
    await expect(description).toBeVisible();

    await description.focus();
    await page.keyboard.type("Important context", { delay: 10 });
    await page.keyboard.press("Escape");
    await expect(description).toBeHidden();

    // Re-open the task and confirm the description survived.
    await page.getByRole("button", { name: new RegExp(`^Task: ${TASK_TITLE}`) }).click();
    await expect(page.getByPlaceholder("Notes, acceptance criteria, links…")).toHaveValue(
      "Important context"
    );
  });

  test("status select shows the human label, not the raw value", async ({ page }) => {
    const taskCard = await seedProjectAndTask(page);

    await taskCard.click();
    // The status trigger should render "To Do", not "todo".
    const statusTrigger = page.getByRole("combobox").first();
    await expect(statusTrigger).toContainText("To Do");
    await expect(statusTrigger).not.toContainText("todo");

    // Change to In Progress. The trigger should immediately reflect the label.
    await statusTrigger.click();
    await page.getByRole("option", { name: "In Progress" }).click();
    await expect(statusTrigger).toContainText("In Progress");
    await expect(statusTrigger).not.toContainText("in_progress");
  });

  test("category select shows the human label, not the raw value", async ({ page }) => {
    const taskCard = await seedProjectAndTask(page);

    await taskCard.click();
    // The category trigger (second combobox) defaults to "No category".
    const categoryTrigger = page.getByRole("combobox").nth(1);
    await expect(categoryTrigger).toContainText("No category");
    await expect(categoryTrigger).not.toContainText("__none__");
  });
});
