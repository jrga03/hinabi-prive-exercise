import type {
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ReorderTaskUpdate,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from '../types'

export interface ProjectRepository {
  list(): Promise<Project[]>
  get(id: string): Promise<Project | null>
  create(input: CreateProjectInput): Promise<Project>
  update(id: string, patch: UpdateProjectInput): Promise<Project>
  /** Cascades to all tasks owned by the project. */
  delete(id: string): Promise<void>
}

export interface TaskRepository {
  listByProject(projectId: string): Promise<Task[]>
  create(input: CreateTaskInput): Promise<Task>
  createMany(inputs: CreateTaskInput[]): Promise<Task[]>
  update(id: string, patch: UpdateTaskInput): Promise<Task>
  /** Batch reorder — all updates applied in a single write. */
  reorder(updates: ReorderTaskUpdate[]): Promise<void>
  /** Cascades to all descendant tasks (recursive). */
  delete(id: string): Promise<void>
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RepositoryError'
  }
}

export class NotFoundError extends RepositoryError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`)
    this.name = 'NotFoundError'
  }
}
