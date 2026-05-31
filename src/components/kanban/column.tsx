"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { AddTaskInline } from "@/components/kanban/add-task-inline";
import { TaskCard } from "@/components/kanban/task-card";
import { COLUMN_META } from "@/lib/constants";
import type { Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const COLUMN_DROP_PREFIX = "column-";

export function columnDropId(status: TaskStatus): string {
  return `${COLUMN_DROP_PREFIX}${status}`;
}

export function isColumnDropId(id: string): boolean {
  return id.startsWith(COLUMN_DROP_PREFIX);
}

export function statusFromColumnDropId(id: string): TaskStatus {
  return id.slice(COLUMN_DROP_PREFIX.length) as TaskStatus;
}

interface KanbanColumnProps {
  projectId: string;
  status: TaskStatus;
  tasks: Task[];
  tasksById: Map<string, Task>;
  onSelectTask?: (task: Task) => void;
}

const EMPTY_COPY: Record<TaskStatus, string> = {
  todo: "Nothing here yet — add a task or generate ideas.",
  in_progress: "Pull from To Do to start working.",
  done: "Finished work lands here.",
};

export function KanbanColumn({
  projectId,
  status,
  tasks,
  tasksById,
  onSelectTask,
}: KanbanColumnProps) {
  const meta = COLUMN_META[status];
  const taskCount = tasks.length;
  const dropId = columnDropId(status);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <section className="space-y-3" aria-label={`${meta.label} column`}>
      <header className="flex items-center gap-2">
        <span aria-hidden className={cn("inline-block size-2 rounded-full", meta.accent)} />
        <h2 className="font-heading text-sm font-medium tracking-tight">{meta.label}</h2>
        <span
          aria-label={`${taskCount} ${taskCount === 1 ? "task" : "tasks"}`}
          className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums"
        >
          {taskCount}
        </span>
      </header>
      <SortableContext id={dropId} items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "min-h-[6rem] space-y-3 rounded-lg p-1 transition-colors",
            isOver && "bg-muted/40 ring-foreground/10 ring-1"
          )}
        >
          {taskCount === 0 ? (
            <div className="border-border/70 text-muted-foreground/80 flex min-h-[5rem] items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs">
              {EMPTY_COPY[status]}
            </div>
          ) : (
            tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                position={{ index, total: taskCount }}
                parentTitle={
                  task.parentTaskId ? tasksById.get(task.parentTaskId)?.title : undefined
                }
                onSelect={onSelectTask}
              />
            ))
          )}
          <AddTaskInline projectId={projectId} status={status} />
        </div>
      </SortableContext>
    </section>
  );
}
