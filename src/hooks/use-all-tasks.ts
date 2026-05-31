"use client";

import { useQuery } from "@tanstack/react-query";

import { taskRepo } from "@/lib/repositories";
import { useProjects } from "@/hooks/use-projects";
import type { Task } from "@/lib/types";

export const allTasksKey = ["tasks", "all"] as const;

/**
 * Aggregates tasks across every known project. Listed under a stable key so
 * the project list's task-count map stays consistent with the per-project
 * caches the board pages populate.
 */
export function useAllTasks() {
  const projects = useProjects();
  const projectIds = projects.data?.map((p) => p.id) ?? [];
  return useQuery({
    queryKey: [...allTasksKey, projectIds] as const,
    enabled: projects.isSuccess,
    queryFn: async (): Promise<Task[]> => {
      const lists = await Promise.all(projectIds.map((id) => taskRepo.listByProject(id)));
      return lists.flat();
    },
  });
}
