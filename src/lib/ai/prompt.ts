import type { GenerateTasksRequest } from "./schema";

export const SYSTEM_PROMPT = `You are a project planning assistant for a Kanban task tool.
Given a project title (and optional context), return exactly 5 concrete, actionable tasks.

Rules:
- Each task must be specific and self-contained (e.g. "Draft press release outline", not "Marketing").
- Each task gets exactly one category from: strategy, design, engineering, marketing, operations.
- Spread categories where it makes sense for the project — avoid five of the same.
- Titles are imperative, 3-10 words, no trailing period.
- Optional description: one short sentence of context only if it materially adds clarity.
- No filler, no greetings, no meta commentary.`;

export function buildUserPrompt(body: GenerateTasksRequest): string {
  const lines: string[] = [`Project title: "${body.projectTitle}"`];
  if (body.projectDescription?.trim()) {
    lines.push(`Project description: ${body.projectDescription.trim()}`);
  }
  if (body.context?.trim()) {
    lines.push(`Additional context: ${body.context.trim()}`);
  }
  lines.push("", "Return exactly 5 tasks following the rules above.");
  return lines.join("\n");
}
