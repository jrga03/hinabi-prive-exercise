import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { STORAGE_KEYS } from "../constants";
import type { CreateProjectInput, CreateTaskInput } from "../types";
import { LocalStorageProjectRepository, LocalStorageTaskRepository } from "./local-storage";
import { NotFoundError } from "./types";

function makeProjectInput(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
  return { title: "Demo project", description: "A test project", ...overrides };
}

function makeTaskInput(
  projectId: string,
  overrides: Partial<CreateTaskInput> = {}
): CreateTaskInput {
  return {
    projectId,
    parentTaskId: null,
    title: "Demo task",
    description: undefined,
    status: "todo",
    category: "engineering",
    ...overrides,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("LocalStorageProjectRepository", () => {
  it("create persists and list returns the new project", async () => {
    const repo = new LocalStorageProjectRepository();
    const project = await repo.create(makeProjectInput({ title: "Launch" }));
    expect(project.id).toBeTruthy();
    expect(project.title).toBe("Launch");
    expect(project.createdAt).toBe(project.updatedAt);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(project.id);
  });

  it("get returns null for unknown id", async () => {
    const repo = new LocalStorageProjectRepository();
    await repo.create(makeProjectInput());
    const found = await repo.get("00000000-0000-4000-8000-000000000000");
    expect(found).toBeNull();
  });

  it("update merges patch fields and bumps updatedAt", async () => {
    const repo = new LocalStorageProjectRepository();
    const created = await repo.create(makeProjectInput({ title: "Original" }));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(created.id, { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
    expect(updated.description).toBe(created.description);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("update rejects with NotFoundError for missing id", async () => {
    const repo = new LocalStorageProjectRepository();
    await expect(
      repo.update("00000000-0000-4000-8000-000000000000", { title: "x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete removes the project", async () => {
    const repo = new LocalStorageProjectRepository();
    const p1 = await repo.create(makeProjectInput({ title: "A" }));
    const p2 = await repo.create(makeProjectInput({ title: "B" }));
    await repo.delete(p1.id);
    const list = await repo.list();
    expect(list.map((p) => p.id)).toEqual([p2.id]);
  });

  it("create rejects invalid input via Zod", async () => {
    const repo = new LocalStorageProjectRepository();
    await expect(repo.create({ title: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("list returns [] when localStorage is corrupt JSON", async () => {
    window.localStorage.setItem(STORAGE_KEYS.projects, "{ this is not json");
    const repo = new LocalStorageProjectRepository();
    const list = await repo.list();
    expect(list).toEqual([]);
  });

  it("list returns [] when localStorage holds schema-invalid data", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.projects,
      JSON.stringify([{ id: "not-a-uuid", title: 5 }])
    );
    const repo = new LocalStorageProjectRepository();
    const list = await repo.list();
    expect(list).toEqual([]);
  });
});

describe("LocalStorageTaskRepository", () => {
  it("create assigns order 0 to first task and N to Nth in same column", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "11111111-1111-4111-8111-111111111111";
    const t1 = await repo.create(makeTaskInput(pid));
    const t2 = await repo.create(makeTaskInput(pid, { title: "second" }));
    const t3 = await repo.create(makeTaskInput(pid, { title: "third" }));
    expect(t1.order).toBe(0);
    expect(t2.order).toBe(1);
    expect(t3.order).toBe(2);
  });

  it("createMany appends to column tail with sequential orders", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "22222222-2222-4222-8222-222222222222";
    await repo.create(makeTaskInput(pid));
    const batch = await repo.createMany([
      makeTaskInput(pid, { title: "a" }),
      makeTaskInput(pid, { title: "b" }),
      makeTaskInput(pid, { title: "c", status: "in_progress" }),
    ]);
    expect(batch.map((t) => t.order)).toEqual([1, 2, 0]);
  });

  it("listByProject filters by projectId", async () => {
    const repo = new LocalStorageTaskRepository();
    const pidA = "33333333-3333-4333-8333-333333333333";
    const pidB = "44444444-4444-4444-8444-444444444444";
    await repo.create(makeTaskInput(pidA, { title: "in A" }));
    await repo.create(makeTaskInput(pidB, { title: "in B" }));
    const aTasks = await repo.listByProject(pidA);
    expect(aTasks).toHaveLength(1);
    expect(aTasks[0].title).toBe("in A");
  });

  it("update merges patch fields, refuses to mutate id/createdAt/order", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "55555555-5555-4555-8555-555555555555";
    const t = await repo.create(makeTaskInput(pid, { title: "before" }));
    const updated = await repo.update(t.id, {
      title: "after",
      status: "done",
      category: "design",
    });
    expect(updated.id).toBe(t.id);
    expect(updated.title).toBe("after");
    expect(updated.status).toBe("done");
    expect(updated.category).toBe("design");
    expect(updated.order).toBe(t.order);
    expect(updated.createdAt).toBe(t.createdAt);
  });

  it("update rejects with NotFoundError for missing id", async () => {
    const repo = new LocalStorageTaskRepository();
    await expect(
      repo.update("00000000-0000-4000-8000-000000000000", { title: "x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reorder applies batch updates and persists across instances", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "66666666-6666-4666-8666-666666666666";
    const a = await repo.create(makeTaskInput(pid, { title: "a" }));
    const b = await repo.create(makeTaskInput(pid, { title: "b" }));
    const c = await repo.create(makeTaskInput(pid, { title: "c" }));
    await repo.reorder([
      { id: a.id, status: "in_progress", order: 0 },
      { id: c.id, status: "todo", order: 0 },
      { id: b.id, status: "todo", order: 1 },
    ]);
    const fresh = new LocalStorageTaskRepository();
    const tasks = await fresh.listByProject(pid);
    const map = new Map(tasks.map((t) => [t.id, t]));
    expect(map.get(a.id)).toMatchObject({ status: "in_progress", order: 0 });
    expect(map.get(c.id)).toMatchObject({ status: "todo", order: 0 });
    expect(map.get(b.id)).toMatchObject({ status: "todo", order: 1 });
  });

  it("reorder leaves tasks not in update list untouched", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "77777777-7777-4777-8777-777777777777";
    const a = await repo.create(makeTaskInput(pid, { title: "a" }));
    const b = await repo.create(makeTaskInput(pid, { title: "b" }));
    await repo.reorder([{ id: a.id, status: "done", order: 0 }]);
    const tasks = await repo.listByProject(pid);
    const bAfter = tasks.find((t) => t.id === b.id);
    expect(bAfter?.status).toBe("todo");
    expect(bAfter?.order).toBe(1);
  });

  it("delete cascades to all descendants (multi-level)", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "88888888-8888-4888-8888-888888888888";
    const parent = await repo.create(makeTaskInput(pid, { title: "parent" }));
    const child = await repo.create(
      makeTaskInput(pid, { title: "child", parentTaskId: parent.id })
    );
    const grand = await repo.create(makeTaskInput(pid, { title: "grand", parentTaskId: child.id }));
    const sibling = await repo.create(makeTaskInput(pid, { title: "sibling" }));
    await repo.delete(parent.id);
    const tasks = await repo.listByProject(pid);
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain(sibling.id);
    expect(ids).not.toContain(parent.id);
    expect(ids).not.toContain(child.id);
    expect(ids).not.toContain(grand.id);
  });

  it("create rejects invalid input via Zod", async () => {
    const repo = new LocalStorageTaskRepository();
    const pid = "99999999-9999-4999-8999-999999999999";
    await expect(repo.create(makeTaskInput(pid, { title: "" }))).rejects.toBeInstanceOf(ZodError);
  });

  it("listByProject returns [] when localStorage holds corrupt JSON", async () => {
    window.localStorage.setItem(STORAGE_KEYS.tasks, "<not json>");
    const repo = new LocalStorageTaskRepository();
    const tasks = await repo.listByProject("any-id");
    expect(tasks).toEqual([]);
  });
});

describe("cross-repo cascade", () => {
  it("deleting a project removes all its tasks but leaves other projects intact", async () => {
    const projectRepo = new LocalStorageProjectRepository();
    const taskRepo = new LocalStorageTaskRepository();
    const a = await projectRepo.create(makeProjectInput({ title: "A" }));
    const b = await projectRepo.create(makeProjectInput({ title: "B" }));
    await taskRepo.create(makeTaskInput(a.id, { title: "a1" }));
    await taskRepo.create(makeTaskInput(a.id, { title: "a2" }));
    await taskRepo.create(makeTaskInput(b.id, { title: "b1" }));
    await projectRepo.delete(a.id);
    expect(await taskRepo.listByProject(a.id)).toEqual([]);
    expect(await taskRepo.listByProject(b.id)).toHaveLength(1);
    const projects = await projectRepo.list();
    expect(projects.map((p) => p.id)).toEqual([b.id]);
  });
});
