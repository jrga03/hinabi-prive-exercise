"use client";

import { useCallback, useState } from "react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { parsePartialJson } from "ai";

import { useCreateTasksBulk } from "@/hooks/use-tasks";
import { AIResponseSchema, type AITask } from "@/lib/ai/schema";
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

export type PartialAITask = Partial<AITask>;

// UseMutationResult is a discriminated union over status, so an `interface
// extends` won't work — use an intersection so each variant of the union
// retains its narrowing while picking up partialTasks.
export type UseMagicGenerateResult = UseMutationResult<Task[], Error, MagicGenerateVars> & {
  partialTasks: PartialAITask[];
};

function extractPartialTasks(parsed: unknown): PartialAITask[] {
  if (!parsed || typeof parsed !== "object") return [];
  const tasks = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((task): task is PartialAITask => task !== null && typeof task === "object");
}

export function useMagicGenerate(): UseMagicGenerateResult {
  const createTasksBulk = useCreateTasksBulk();
  const [partialTasks, setPartialTasks] = useState<PartialAITask[]>([]);

  const mutation = useMutation<Task[], Error, MagicGenerateVars>({
    mutationFn: async (vars) => {
      setPartialTasks([]);

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

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message = data && typeof data.error === "string" ? data.error : "AI request failed.";
        throw new GenerateTasksError(res.status, message);
      }
      if (!res.body) {
        throw new GenerateTasksError(502, "AI response was empty. Try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const { value: parsed } = await parsePartialJson(accumulated);
          const tasks = extractPartialTasks(parsed);
          if (tasks.length > 0) setPartialTasks(tasks);
        }
        accumulated += decoder.decode();
      } finally {
        reader.releaseLock();
      }

      let finalObject: unknown;
      try {
        finalObject = JSON.parse(accumulated);
      } catch {
        throw new GenerateTasksError(502, "AI returned unexpected output. Try again.");
      }

      const validated = AIResponseSchema.safeParse(finalObject);
      if (!validated.success) {
        throw new GenerateTasksError(502, "AI returned unexpected output. Try again.");
      }

      const inputs: CreateTaskInput[] = validated.data.tasks.map((task) => ({
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

  const baseReset = mutation.reset;
  const reset = useCallback(() => {
    setPartialTasks([]);
    baseReset();
  }, [baseReset]);

  // Spread the mutation, override reset, and tack on partialTasks. We cast
  // because TS can't see through the spread to preserve the discriminated
  // union's status narrowing — the runtime shape is correct.
  return { ...mutation, reset, partialTasks } as UseMagicGenerateResult;
}
