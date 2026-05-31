"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { projectRepo } from "@/lib/repositories";
import type { CreateProjectInput, Project, UpdateProjectInput } from "@/lib/types";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => projectRepo.list(),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? projectKeys.detail(id) : projectKeys.detail("__none__"),
    queryFn: () => projectRepo.get(id as string),
    enabled: Boolean(id),
  });
}

type CreateContext = { previous: Project[] | undefined };

export function useCreateProject(): UseMutationResult<
  Project,
  Error,
  CreateProjectInput,
  CreateContext
> {
  const qc = useQueryClient();
  return useMutation<Project, Error, CreateProjectInput, CreateContext>({
    mutationFn: (input) => projectRepo.create(input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: projectKeys.all });
      const previous = qc.getQueryData<Project[]>(projectKeys.all);
      const now = new Date().toISOString();
      const optimistic: Project = {
        id: `optimistic-${crypto.randomUUID()}`,
        title: input.title,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<Project[]>(projectKeys.all, (prev) =>
        prev ? [...prev, optimistic] : [optimistic]
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(projectKeys.all, ctx.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

type UpdateContext = {
  previousList: Project[] | undefined;
  previousDetail: Project | null | undefined;
};

export function useUpdateProject(): UseMutationResult<
  Project,
  Error,
  { id: string; patch: UpdateProjectInput },
  UpdateContext
> {
  const qc = useQueryClient();
  return useMutation<Project, Error, { id: string; patch: UpdateProjectInput }, UpdateContext>({
    mutationFn: ({ id, patch }) => projectRepo.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: projectKeys.all }),
        qc.cancelQueries({ queryKey: projectKeys.detail(id) }),
      ]);
      const previousList = qc.getQueryData<Project[]>(projectKeys.all);
      const previousDetail = qc.getQueryData<Project | null>(projectKeys.detail(id));
      const now = new Date().toISOString();
      qc.setQueryData<Project[]>(projectKeys.all, (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p))
      );
      if (previousDetail) {
        qc.setQueryData<Project>(projectKeys.detail(id), {
          ...previousDetail,
          ...patch,
          updatedAt: now,
        });
      }
      return { previousList, previousDetail };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previousList) {
        qc.setQueryData(projectKeys.all, ctx.previousList);
      }
      if (ctx?.previousDetail !== undefined) {
        qc.setQueryData(projectKeys.detail(id), ctx.previousDetail);
      }
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) });
    },
  });
}

type DeleteContext = { previous: Project[] | undefined };

export function useDeleteProject(): UseMutationResult<void, Error, string, DeleteContext> {
  const qc = useQueryClient();
  return useMutation<void, Error, string, DeleteContext>({
    mutationFn: (id) => projectRepo.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: projectKeys.all });
      const previous = qc.getQueryData<Project[]>(projectKeys.all);
      qc.setQueryData<Project[]>(projectKeys.all, (prev) => prev?.filter((p) => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(projectKeys.all, ctx.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: projectKeys.all });
      qc.removeQueries({ queryKey: projectKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["tasks", "project", id] });
    },
  });
}
