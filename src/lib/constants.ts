import type { TaskStatus } from "./types";

export const STORAGE_KEYS = {
  projects: "tio:projects",
  tasks: "tio:tasks",
} as const;

type ColumnMeta = {
  label: string;
  /** Tailwind class for the column header accent dot. */
  accent: string;
};

export const COLUMN_META: Record<TaskStatus, ColumnMeta> = {
  todo: { label: "To Do", accent: "bg-zinc-400 dark:bg-zinc-600" },
  in_progress: { label: "In Progress", accent: "bg-violet-500" },
  done: { label: "Done", accent: "bg-emerald-500" },
};

export const COLUMN_ORDER: readonly TaskStatus[] = ["todo", "in_progress", "done"] as const;
