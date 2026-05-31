'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { taskRepo } from '@/lib/repositories'
import type {
  CreateTaskInput,
  ReorderTaskUpdate,
  Task,
  UpdateTaskInput,
} from '@/lib/types'

export const taskKeys = {
  byProject: (projectId: string) => ['tasks', 'project', projectId] as const,
}

export function useTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? taskKeys.byProject(projectId) : taskKeys.byProject('__none__'),
    queryFn: () => taskRepo.listByProject(projectId as string),
    enabled: Boolean(projectId),
  })
}

type TaskListContext = { previous: Task[] | undefined; projectId: string }

function buildOptimisticTask(input: CreateTaskInput, order: number): Task {
  const now = new Date().toISOString()
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    projectId: input.projectId,
    parentTaskId: input.parentTaskId,
    title: input.title,
    description: input.description,
    status: input.status,
    category: input.category,
    order,
    createdAt: now,
    updatedAt: now,
  }
}

function nextOrderInColumn(tasks: Task[], projectId: string, status: Task['status']): number {
  const max = tasks
    .filter((t) => t.projectId === projectId && t.status === status)
    .reduce((acc, t) => Math.max(acc, t.order), -1)
  return max + 1
}

export function useCreateTask(): UseMutationResult<Task, Error, CreateTaskInput, TaskListContext> {
  const qc = useQueryClient()
  return useMutation<Task, Error, CreateTaskInput, TaskListContext>({
    mutationFn: (input) => taskRepo.create(input),
    onMutate: async (input) => {
      const key = taskKeys.byProject(input.projectId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      const order = nextOrderInColumn(previous ?? [], input.projectId, input.status)
      const optimistic = buildOptimisticTask(input, order)
      qc.setQueryData<Task[]>(key, (prev) => (prev ? [...prev, optimistic] : [optimistic]))
      return { previous, projectId: input.projectId }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(taskKeys.byProject(ctx.projectId), ctx.previous)
      }
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: taskKeys.byProject(input.projectId) })
    },
  })
}

export function useCreateTasksBulk(): UseMutationResult<
  Task[],
  Error,
  CreateTaskInput[],
  TaskListContext
> {
  const qc = useQueryClient()
  return useMutation<Task[], Error, CreateTaskInput[], TaskListContext>({
    mutationFn: (inputs) => taskRepo.createMany(inputs),
    onMutate: async (inputs) => {
      if (inputs.length === 0) {
        return { previous: undefined, projectId: '' }
      }
      const projectId = inputs[0].projectId
      const key = taskKeys.byProject(projectId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      const working: Task[] = previous ? [...previous] : []
      const orderTracker = new Map<string, number>()
      for (const input of inputs) {
        const trackerKey = `${input.projectId}:${input.status}`
        let order = orderTracker.get(trackerKey)
        if (order === undefined) {
          order = nextOrderInColumn(working, input.projectId, input.status)
        } else {
          order += 1
        }
        orderTracker.set(trackerKey, order)
        working.push(buildOptimisticTask(input, order))
      }
      qc.setQueryData<Task[]>(key, working)
      return { previous, projectId }
    },
    onError: (_err, _inputs, ctx) => {
      if (ctx?.previous && ctx.projectId) {
        qc.setQueryData(taskKeys.byProject(ctx.projectId), ctx.previous)
      }
    },
    onSettled: (_data, _err, inputs) => {
      if (inputs.length === 0) return
      qc.invalidateQueries({ queryKey: taskKeys.byProject(inputs[0].projectId) })
    },
  })
}

type UpdateTaskVars = { id: string; projectId: string; patch: UpdateTaskInput }

export function useUpdateTask(): UseMutationResult<
  Task,
  Error,
  UpdateTaskVars,
  TaskListContext
> {
  const qc = useQueryClient()
  return useMutation<Task, Error, UpdateTaskVars, TaskListContext>({
    mutationFn: ({ id, patch }) => taskRepo.update(id, patch),
    onMutate: async ({ id, projectId, patch }) => {
      const key = taskKeys.byProject(projectId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      const now = new Date().toISOString()
      qc.setQueryData<Task[]>(key, (prev) =>
        prev?.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t)),
      )
      return { previous, projectId }
    },
    onError: (_err, { projectId }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(taskKeys.byProject(projectId), ctx.previous)
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      qc.invalidateQueries({ queryKey: taskKeys.byProject(projectId) })
    },
  })
}

type ReorderVars = { projectId: string; updates: ReorderTaskUpdate[] }

export function useReorderTasks(): UseMutationResult<
  void,
  Error,
  ReorderVars,
  TaskListContext
> {
  const qc = useQueryClient()
  return useMutation<void, Error, ReorderVars, TaskListContext>({
    mutationFn: ({ updates }) => taskRepo.reorder(updates),
    onMutate: async ({ projectId, updates }) => {
      const key = taskKeys.byProject(projectId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      const byId = new Map(updates.map((u) => [u.id, u]))
      const now = new Date().toISOString()
      qc.setQueryData<Task[]>(key, (prev) =>
        prev?.map((t) => {
          const u = byId.get(t.id)
          return u ? { ...t, status: u.status, order: u.order, updatedAt: now } : t
        }),
      )
      return { previous, projectId }
    },
    onError: (_err, { projectId }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(taskKeys.byProject(projectId), ctx.previous)
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      qc.invalidateQueries({ queryKey: taskKeys.byProject(projectId) })
    },
  })
}

type DeleteTaskVars = { id: string; projectId: string }

export function useDeleteTask(): UseMutationResult<
  void,
  Error,
  DeleteTaskVars,
  TaskListContext
> {
  const qc = useQueryClient()
  return useMutation<void, Error, DeleteTaskVars, TaskListContext>({
    mutationFn: ({ id }) => taskRepo.delete(id),
    onMutate: async ({ id, projectId }) => {
      const key = taskKeys.byProject(projectId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      const toRemove = new Set<string>([id])
      let added = true
      while (added && previous) {
        added = false
        for (const t of previous) {
          if (t.parentTaskId && toRemove.has(t.parentTaskId) && !toRemove.has(t.id)) {
            toRemove.add(t.id)
            added = true
          }
        }
      }
      qc.setQueryData<Task[]>(key, (prev) => prev?.filter((t) => !toRemove.has(t.id)))
      return { previous, projectId }
    },
    onError: (_err, { projectId }, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(taskKeys.byProject(projectId), ctx.previous)
      }
    },
    onSettled: (_data, _err, { projectId }) => {
      qc.invalidateQueries({ queryKey: taskKeys.byProject(projectId) })
    },
  })
}
