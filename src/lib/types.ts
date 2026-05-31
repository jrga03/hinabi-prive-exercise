import type { z } from 'zod'
import type { ProjectSchema, TaskSchema } from './schemas'

export type Project = z.infer<typeof ProjectSchema>
export type Task = z.infer<typeof TaskSchema>

export type TaskStatus = Task['status']
export type TaskCategory = Task['category']

export type CreateProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
export type UpdateProjectInput = Partial<Pick<Project, 'title' | 'description'>>

export type CreateTaskInput = Omit<Task, 'id' | 'order' | 'createdAt' | 'updatedAt'>
export type UpdateTaskInput = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'category' | 'parentTaskId'>
>

export type ReorderTaskUpdate = {
  id: string
  status: TaskStatus
  order: number
}
