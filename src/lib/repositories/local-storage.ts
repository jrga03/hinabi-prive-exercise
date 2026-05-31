import { STORAGE_KEYS } from "../constants";
import { ProjectSchema, ProjectsArraySchema, TaskSchema, TasksArraySchema } from "../schemas";
import type {
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ReorderTaskUpdate,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "../types";
import { NotFoundError, type ProjectRepository, type TaskRepository } from "./types";

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn(`[repo] localStorage.getItem(${key}) failed`, err);
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[repo] localStorage.setItem(${key}) failed`, err);
    throw err;
  }
}

function readProjects(): Project[] {
  const raw = readRaw(STORAGE_KEYS.projects);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[repo] projects JSON parse failed; resetting to []", err);
    return [];
  }
  const result = ProjectsArraySchema.safeParse(parsed);
  if (!result.success) {
    console.warn("[repo] projects schema validation failed; resetting to []", result.error.message);
    return [];
  }
  return result.data;
}

function writeProjects(projects: Project[]): void {
  writeRaw(STORAGE_KEYS.projects, JSON.stringify(projects));
}

function readTasks(): Task[] {
  const raw = readRaw(STORAGE_KEYS.tasks);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn("[repo] tasks JSON parse failed; resetting to []", err);
    return [];
  }
  const result = TasksArraySchema.safeParse(parsed);
  if (!result.success) {
    console.warn("[repo] tasks schema validation failed; resetting to []", result.error.message);
    return [];
  }
  return result.data;
}

function writeTasks(tasks: Task[]): void {
  writeRaw(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

function nowIso(): string {
  return new Date().toISOString();
}

export class LocalStorageProjectRepository implements ProjectRepository {
  async list(): Promise<Project[]> {
    return readProjects();
  }

  async get(id: string): Promise<Project | null> {
    return readProjects().find((p) => p.id === id) ?? null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const now = nowIso();
    const project: Project = ProjectSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    const projects = readProjects();
    writeProjects([...projects, project]);
    return project;
  }

  async update(id: string, patch: UpdateProjectInput): Promise<Project> {
    const projects = readProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) throw new NotFoundError("Project", id);
    const updated: Project = ProjectSchema.parse({
      ...projects[idx],
      ...patch,
      updatedAt: nowIso(),
    });
    const next = [...projects];
    next[idx] = updated;
    writeProjects(next);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const projects = readProjects();
    const nextProjects = projects.filter((p) => p.id !== id);
    writeProjects(nextProjects);
    const tasks = readTasks();
    const nextTasks = tasks.filter((t) => t.projectId !== id);
    if (nextTasks.length !== tasks.length) {
      writeTasks(nextTasks);
    }
  }
}

const UPDATABLE_TASK_FIELDS = [
  "title",
  "description",
  "status",
  "category",
  "parentTaskId",
] as const;

function applyTaskPatch(existing: Task, patch: UpdateTaskInput): Task {
  const next: Task = { ...existing, updatedAt: nowIso() };
  for (const key of UPDATABLE_TASK_FIELDS) {
    if (key in patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = patch[key];
    }
  }
  return TaskSchema.parse(next);
}

function collectDescendantIds(rootId: string, tasks: Task[]): Set<string> {
  const toDelete = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const t of tasks) {
      if (t.parentTaskId && toDelete.has(t.parentTaskId) && !toDelete.has(t.id)) {
        toDelete.add(t.id);
        added = true;
      }
    }
  }
  return toDelete;
}

export class LocalStorageTaskRepository implements TaskRepository {
  async listByProject(projectId: string): Promise<Task[]> {
    return readTasks().filter((t) => t.projectId === projectId);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const [task] = await this.createMany([input]);
    return task;
  }

  async createMany(inputs: CreateTaskInput[]): Promise<Task[]> {
    if (inputs.length === 0) return [];
    const all = readTasks();
    const maxByColumn = new Map<string, number>();
    for (const t of all) {
      const key = `${t.projectId}:${t.status}`;
      maxByColumn.set(key, Math.max(maxByColumn.get(key) ?? -1, t.order));
    }
    const now = nowIso();
    const created: Task[] = inputs.map((input) => {
      const key = `${input.projectId}:${input.status}`;
      const order = (maxByColumn.get(key) ?? -1) + 1;
      maxByColumn.set(key, order);
      return TaskSchema.parse({
        ...input,
        id: crypto.randomUUID(),
        order,
        createdAt: now,
        updatedAt: now,
      });
    });
    writeTasks([...all, ...created]);
    return created;
  }

  async update(id: string, patch: UpdateTaskInput): Promise<Task> {
    const tasks = readTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new NotFoundError("Task", id);
    const updated = applyTaskPatch(tasks[idx], patch);
    const next = [...tasks];
    next[idx] = updated;
    writeTasks(next);
    return updated;
  }

  async reorder(updates: ReorderTaskUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const tasks = readTasks();
    const byId = new Map(updates.map((u) => [u.id, u]));
    const now = nowIso();
    const next = tasks.map((t) => {
      const u = byId.get(t.id);
      if (!u) return t;
      return TaskSchema.parse({
        ...t,
        status: u.status,
        order: u.order,
        updatedAt: now,
      });
    });
    writeTasks(next);
  }

  async delete(id: string): Promise<void> {
    const tasks = readTasks();
    const idsToDelete = collectDescendantIds(id, tasks);
    const next = tasks.filter((t) => !idsToDelete.has(t.id));
    if (next.length !== tasks.length) {
      writeTasks(next);
    }
  }
}
