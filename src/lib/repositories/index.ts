import { LocalStorageProjectRepository, LocalStorageTaskRepository } from './local-storage'
import type { ProjectRepository, TaskRepository } from './types'

const backend = process.env.NEXT_PUBLIC_BACKEND ?? 'local'

function createProjectRepo(): ProjectRepository {
  switch (backend) {
    case 'local':
      return new LocalStorageProjectRepository()
    default:
      console.warn(`[repo] Unknown NEXT_PUBLIC_BACKEND="${backend}", falling back to local`)
      return new LocalStorageProjectRepository()
  }
}

function createTaskRepo(): TaskRepository {
  switch (backend) {
    case 'local':
      return new LocalStorageTaskRepository()
    default:
      return new LocalStorageTaskRepository()
  }
}

export const projectRepo: ProjectRepository = createProjectRepo()
export const taskRepo: TaskRepository = createTaskRepo()

export type { ProjectRepository, TaskRepository } from './types'
export { NotFoundError, RepositoryError } from './types'
