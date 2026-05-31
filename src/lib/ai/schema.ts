import { z } from "zod";

import { TASK_CATEGORIES } from "@/lib/schemas";

export const RequestSchema = z.object({
  projectTitle: z.string().min(1, "Project title is required").max(200),
  projectDescription: z.string().max(500).optional(),
  context: z.string().max(500).optional(),
});

export type GenerateTasksRequest = z.infer<typeof RequestSchema>;

export const AITaskSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(TASK_CATEGORIES),
  description: z.string().max(500).optional(),
});

export type AITask = z.infer<typeof AITaskSchema>;

export const AIResponseSchema = z.object({
  tasks: z.array(AITaskSchema).length(5),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;
