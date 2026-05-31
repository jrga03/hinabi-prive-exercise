import { z } from 'zod'

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export const TASK_CATEGORIES = [
  'strategy',
  'design',
  'engineering',
  'marketing',
  'operations',
] as const

export const ProjectSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const TaskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  parentTaskId: z.uuid().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES),
  category: z.enum(TASK_CATEGORIES).nullable(),
  order: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const ProjectsArraySchema = z.array(ProjectSchema)
export const TasksArraySchema = z.array(TaskSchema)
