"use client";

import { CornerDownRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_META } from "@/lib/categories";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  parentTitle?: string;
  onSelect?: (task: Task) => void;
  className?: string;
}

export function TaskCard({ task, parentTitle, onSelect, className }: TaskCardProps) {
  const category = task.category ? CATEGORY_META[task.category] : null;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(task) : undefined}
      aria-label={`Open task ${task.title}`}
      className={cn(
        "group/task bg-card text-card-foreground ring-foreground/10 hover:bg-muted/40 focus-visible:ring-ring/50 w-full rounded-lg p-3 text-left text-sm ring-1 transition-colors outline-none focus-visible:ring-2",
        className
      )}
    >
      <div className="space-y-2">
        <p className="line-clamp-2 leading-snug font-medium">{task.title}</p>
        {category || parentTitle ? (
          <div className="flex flex-wrap items-center gap-2">
            {category ? (
              <Badge variant="outline" className={cn("border-transparent ring-1", category.badge)}>
                {category.label}
              </Badge>
            ) : null}
            {parentTitle ? (
              <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs">
                <CornerDownRight aria-hidden className="size-3 shrink-0" />
                <span className="truncate">sub of: {parentTitle}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}
