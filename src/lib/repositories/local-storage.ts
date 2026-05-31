import { STORAGE_KEYS } from '../constants'
import {
  ProjectSchema,
  ProjectsArraySchema,
  TaskSchema,
  TasksArraySchema,
} from '../schemas'
import type {
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ReorderTaskUpdate,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from '../types'
import {
  NotFoundError,
  type ProjectRepository,
  type TaskRepository,
} from './types'

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch (err) {
    console.warn(`[repo] localStorage.getItem(${key}) failed`, err)
    return null
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch (err) {
    console.warn(`[repo] localStorage.setItem(${key}) failed`, err)
    throw err
  }
}

function readProjects(): Project[] {
  const raw = readRaw(STORAGE_KEYS.projects)
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.warn('[repo] projects JSON parse failed; resetting to []', err)
    return []
  }
  const result = ProjectsArraySchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[repo] projects schema validation failed; resetting to []', result.error.message)
    return []
  }
  return result.data
}

function writeProjects(projects: Project[]): void {
  writeRaw(STORAGE_KEYS.projects, JSON.stringify(projects))
}

function readTasks(): Task[] {
  const raw = readRaw(STORAGE_KEYS.tasks)
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.warn('[repo] tasks JSON parse failed; resetting to []', err)
    return []
  }
  const result = TasksArraySchema.safeParse(parsed)
  if (!result.success) {
    console.warn('[repo] tasks schema validation failed; resetting to []', result.error.message)
    return []
  }
  return result.data
}

function writeTasks(tasks: Task[]): void {
  writeRaw(STORAGE_KEYS.tasks, JSON.stringify(tasks))
}

function nowIso(): string {
  return new Date().toISOString()
}

export class LocalStorageProjectRepository implements ProjectRepository {
  list(): Promise<Project[]> {
    return Promise.resolve(readProjects())
  }

  get(id: string): Promise<Project | null> {
    const found = readProjects().find((p) => p.id === id) ?? null
    return Promise.resolve(found)
  }

  create(input: CreateProjectInput): Promise<Project> {
    const now = nowIso()
    const project: Project = ProjectSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    })
    const projects = readProjects()
    writeProjects([...projects, project])
    return Promise.resolve(project)
  }

  update(id: string, patch: UpdateProjectInput): Promise<Project> {
    const projects = readProjects()
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return Promise.reject(new NotFoundError('Project', id))
    const updated: Project = ProjectSchema.parse({
      ...projects[idx],
      ...patch,
      updatedAt: nowIso(),
    })
    const next = [...projects]
    next[idx] = updated
    writeProjects(next)
    return Promise.resolve(updated)
  }

  delete(id: string): Promise<void> {
    const projects = readProjects()
    const nextProjects = projects.filter((p) => p.id !== id)
    writeProjects(nextProjects)
    const tasks = readTasks()
    const nextTasks = tasks.filter((t) => t.projectId !== id)
    if (nextTasks.length !== tasks.length) {
      writeTasks(nextTasks)
    }
    return Promise.resolve()
  }
}

const UPDATABLE_TASK_FIELDS = [
  'title',
  'description',
  'status',
  'category',
  'parentTaskId',
] as const

function applyTaskPatch(existing: Task, patch: UpdateTaskInput): Task {
  const next: Task = { ...existing, updatedAt: nowIso() }
  for (const key of UPDATABLE_TASK_FIELDS) {
    if (key in patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(next as any)[key] = patch[key]
    }
  }
  return TaskSchema.parse(next)
}

function collectDescendantIds(rootId: string, tasks: Task[]): Set<string> {
  const toDelete = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const t of tasks) {
      if (t.parentTaskId && toDelete.has(t.parentTaskId) && !toDelete.has(t.id)) {
        toDelete.add(t.id)
        added = true
      }
    }
  }
  return toDelete
}

export class LocalStorageTaskRepository implements TaskRepository {
  listByProject(projectId: string): Promise<Task[]> {
    const tasks = readTasks().filter((t) => t.projectId === projectId)
    return Promise.resolve(tasks)
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.createMany([input]).then(([task]) => task)
  }

  createMany(inputs: CreateTaskInput[]): Promise<Task[]> {
    if (inputs.length === 0) return Promise.resolve([])
    const all = readTasks()
    const maxByColumn = new Map<string, number>()
    for (const t of all) {
      const key = `${t.projectId}:${t.status}`
      maxByColumn.set(key, Math.max(maxByColumn.get(key) ?? -1, t.order))
    }
    const now = nowIso()
    const created: Task[] = inputs.map((input) => {
      const key = `${input.projectId}:${input.status}`
      const order = (maxByColumn.get(key) ?? -1) + 1
      maxByColumn.set(key, order)
      return TaskSchema.parse({
        ...input,
        id: crypto.randomUUID(),
        order,
        createdAt: now,
        updatedAt: now,
      })
    })
    writeTasks([...all, ...created])
    return Promise.resolve(created)
  }

  update(id: string, patch: UpdateTaskInput): Promise<Task> {
    const tasks = readTasks()
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx === -1) return Promise.reject(new NotFoundError('Task', id))
    const updated = applyTaskPatch(tasks[idx], patch)
    const next = [...tasks]
    next[idx] = updated
    writeTasks(next)
    return Promise.resolve(updated)
  }

  reorder(updates: ReorderTaskUpdate[]): Promise<void> {
    if (updates.length === 0) return Promise.resolve()
    const tasks = readTasks()
    const byId = new Map(updates.map((u) => [u.id, u]))
    const now = nowIso()
    const next = tasks.map((t) => {
      const u = byId.get(t.id)
      if (!u) return t
      return TaskSchema.parse({
        ...t,
        status: u.status,
        order: u.order,
        updatedAt: now,
      })
    })
    writeTasks(next)
    return Promise.resolve()
  }

  delete(id: string): Promise<void> {
    const tasks = readTasks()
    const idsToDelete = collectDescendantIds(id, tasks)
    const next = tasks.filter((t) => !idsToDelete.has(t.id))
    if (next.length !== tasks.length) {
      writeTasks(next)
    }
    return Promise.resolve()
  }
}
