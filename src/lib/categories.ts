import type { TaskCategory } from "./types";

type CategoryMeta = {
  label: string;
  /** Tailwind classes for the badge — light + dark variants paired. */
  badge: string;
  /** Solid dot accent (used in selects, legends). */
  dot: string;
};

type NonNullCategory = Exclude<TaskCategory, null>;

export const CATEGORY_META: Record<NonNullCategory, CategoryMeta> = {
  strategy: {
    label: "Strategy",
    badge:
      "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900",
    dot: "bg-violet-500",
  },
  design: {
    label: "Design",
    badge:
      "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
    dot: "bg-rose-500",
  },
  engineering: {
    label: "Engineering",
    badge:
      "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900",
    dot: "bg-blue-500",
  },
  marketing: {
    label: "Marketing",
    badge:
      "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
    dot: "bg-amber-500",
  },
  operations: {
    label: "Operations",
    badge:
      "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
    dot: "bg-emerald-500",
  },
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as NonNullCategory,
  label: meta.label,
}));
