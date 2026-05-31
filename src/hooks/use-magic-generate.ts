"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCreateTasksBulk } from "@/hooks/use-tasks";
import { AIResponseSchema } from "@/lib/ai/schema";
import type { CreateTaskInput, Task } from "@/lib/types";

export interface MagicGenerateVars {
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  context?: string;
  signal?: AbortSignal;
}

export class GenerateTasksError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GenerateTasksError";
    this.status = status;
  }
}

export function useMagicGenerate(): UseMutationResult<Task[], Error, MagicGenerateVars> {
  const createTasksBulk = useCreateTasksBulk();
  return useMutation<Task[], Error, MagicGenerateVars>({
    mutationFn: async (vars) => {
      const res = await fetch("/api/ai/generate-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectTitle: vars.projectTitle,
          projectDescription: vars.projectDescription,
          context: vars.context,
        }),
        signal: vars.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "AI request failed.";
        throw new GenerateTasksError(res.status, message);
      }
      const parsed = AIResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new GenerateTasksError(502, "AI returned unexpected output. Try again.");
      }
      const inputs: CreateTaskInput[] = parsed.data.tasks.map((task) => ({
        projectId: vars.projectId,
        parentTaskId: null,
        title: task.title,
        description: task.description,
        status: "todo",
        category: task.category,
      }));
      return createTasksBulk.mutateAsync(inputs);
    },
  });
}
