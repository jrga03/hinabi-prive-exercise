"use client";

import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CornerDownRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_META } from "@/lib/categories";
import { COLUMN_META } from "@/lib/constants";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  parentTitle?: string;
  position: { index: number; total: number };
  onSelect?: (task: Task) => void;
  className?: string;
}

export function TaskCard({ task, parentTitle, position, onSelect, className }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect ? () => onSelect(task) : undefined}
      aria-label={`Task: ${task.title}. Column: ${COLUMN_META[task.status].label}. Position ${
        position.index + 1
      } of ${position.total}.`}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group/task bg-card text-card-foreground ring-foreground/10 hover:bg-muted/40 focus-visible:ring-ring/50 block w-full touch-none rounded-lg p-3 text-left text-sm ring-1 transition-colors outline-none focus-visible:ring-2",
        isDragging && "opacity-40",
        className
      )}
    >
      <TaskCardContent task={task} parentTitle={parentTitle} dimSubIndicator={isDragging} />
    </button>
  );
}

/**
 * Pure-presentation card for use inside dnd-kit's DragOverlay. No useSortable,
 * no listeners — just the visible content with a small tilt + shadow.
 */
export function TaskCardOverlay({ task, parentTitle }: { task: Task; parentTitle?: string }) {
  return (
    <div className="bg-card text-card-foreground ring-foreground/10 w-full rotate-3 rounded-lg p-3 text-left text-sm shadow-2xl ring-1">
      <TaskCardContent task={task} parentTitle={parentTitle} dimSubIndicator />
    </div>
  );
}

function TaskCardContent({
  task,
  parentTitle,
  dimSubIndicator,
}: {
  task: Task;
  parentTitle?: string;
  dimSubIndicator?: boolean;
}) {
  const category = task.category ? CATEGORY_META[task.category] : null;
  return (
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
            <span
              className={cn(
                "text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs",
                dimSubIndicator && "opacity-0"
              )}
            >
              <CornerDownRight aria-hidden className="size-3 shrink-0" />
              <span className="truncate">sub of: {parentTitle}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
