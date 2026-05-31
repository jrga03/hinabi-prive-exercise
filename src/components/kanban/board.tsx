"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { BoardColumnsSkeleton } from "@/components/kanban/board-skeleton";
import { KanbanColumn, isColumnDropId, statusFromColumnDropId } from "@/components/kanban/column";
import { TaskCardOverlay } from "@/components/kanban/task-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { taskKeys, useReorderTasks, useTasks } from "@/hooks/use-tasks";
import { COLUMN_ORDER } from "@/lib/constants";
import type { ReorderTaskUpdate, Task, TaskStatus } from "@/lib/types";

export { BoardColumnsSkeleton };

interface BoardProps {
  projectId: string;
  onSelectTask?: (task: Task) => void;
}

export function Board({ projectId, onSelectTask }: BoardProps) {
  const tasks = useTasks(projectId);
  const reorderTasks = useReorderTasks();
  const queryClient = useQueryClient();
  const snapshotRef = useRef<Task[] | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);

  const taskList = useMemo(() => tasks.data ?? [], [tasks.data]);
  const grouped = useMemo(() => groupByStatus(taskList), [taskList]);
  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of taskList) map.set(t.id, t);
    return map;
  }, [taskList]);
  const activeTask = activeId ? (tasksById.get(activeId) ?? null) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (tasks.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load tasks</AlertTitle>
        <AlertDescription>
          {tasks.error.message}
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => tasks.refetch()}>
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (tasks.isPending) {
    return <BoardColumnsSkeleton />;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    snapshotRef.current = queryClient.getQueryData<Task[]>(taskKeys.byProject(projectId)) ?? [];
    setActiveId(id);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    queryClient.setQueryData<Task[]>(taskKeys.byProject(projectId), (prev) => {
      if (!prev) return prev;
      const dragged = prev.find((t) => t.id === activeIdStr);
      if (!dragged) return prev;

      const targetStatus = resolveTargetStatus(overIdStr, prev);
      if (!targetStatus) return prev;
      // Intra-column moves are handled by the sortable transform; only mutate
      // the cache when the column actually changes.
      if (dragged.status === targetStatus) return prev;

      const sourceCol = sortedColumn(prev, dragged.status, activeIdStr);
      const targetCol = sortedColumn(prev, targetStatus, activeIdStr);
      const targetIndex = indexInColumn(targetCol, overIdStr) ?? targetCol.length;
      targetCol.splice(targetIndex, 0, { ...dragged, status: targetStatus });

      const others = prev.filter((t) => t.status !== dragged.status && t.status !== targetStatus);
      return [
        ...others,
        ...sourceCol.map((t, i) => ({ ...t, order: i })),
        ...targetCol.map((t, i) => ({ ...t, order: i })),
      ];
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const snapshot =
      snapshotRef.current ?? queryClient.getQueryData<Task[]>(taskKeys.byProject(projectId)) ?? [];
    setActiveId(null);
    snapshotRef.current = undefined;

    if (!over) {
      queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
      return;
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const dragged = snapshot.find((t) => t.id === activeIdStr);
    if (!dragged) {
      queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
      return;
    }

    const targetStatus = resolveTargetStatus(overIdStr, snapshot);
    if (!targetStatus) {
      queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
      return;
    }

    const sourceStatus = dragged.status;
    let updates: ReorderTaskUpdate[];

    if (sourceStatus === targetStatus) {
      // Intra-column: arrayMove handles both forward and backward swaps; using
      // sortedColumn(...).splice would silently no-op when dragging down by 1.
      const col = sortedColumn(snapshot, sourceStatus);
      const oldIndex = col.findIndex((t) => t.id === activeIdStr);
      const newIndex = isColumnDropId(overIdStr)
        ? col.length - 1
        : col.findIndex((t) => t.id === overIdStr);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
        return;
      }
      updates = arrayMove(col, oldIndex, newIndex).map((t, i) => ({
        id: t.id,
        status: sourceStatus,
        order: i,
      }));
    } else {
      // Cross-column: drop active into target at over's position, then
      // renumber both columns so the source has no gap.
      const sourceCol = sortedColumn(snapshot, sourceStatus, activeIdStr);
      const targetCol = sortedColumn(snapshot, targetStatus);
      const targetIndex = isColumnDropId(overIdStr)
        ? targetCol.length
        : (indexInColumn(targetCol, overIdStr) ?? targetCol.length);

      const newTargetCol = [...targetCol];
      newTargetCol.splice(targetIndex, 0, { ...dragged, status: targetStatus });

      updates = [
        ...newTargetCol.map((t, i) => ({ id: t.id, status: targetStatus, order: i })),
        ...sourceCol.map((t, i) => ({ id: t.id, status: sourceStatus, order: i })),
      ];
    }

    if (isNoopAgainst(snapshot, updates)) {
      queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
      return;
    }

    // Apply the final layout before the mutation runs so the visible state
    // matches what we're persisting (the onDragOver cache may have diverged).
    queryClient.setQueryData(taskKeys.byProject(projectId), applyUpdatesToCache(snapshot, updates));

    reorderTasks.mutate(
      { projectId, updates },
      {
        onError: (err) => {
          queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
          toast.error("Couldn't save the reorder", { description: err.message });
        },
      }
    );
  }

  function handleDragCancel() {
    const snapshot = snapshotRef.current;
    setActiveId(null);
    snapshotRef.current = undefined;
    if (snapshot) queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMN_ORDER.map((status) => (
          <KanbanColumn
            key={status}
            projectId={projectId}
            status={status}
            tasks={grouped[status]}
            tasksById={tasksById}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCardOverlay
            task={activeTask}
            parentTitle={
              activeTask.parentTaskId ? tasksById.get(activeTask.parentTaskId)?.title : undefined
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function resolveTargetStatus(overId: string, tasks: Task[]): TaskStatus | null {
  if (isColumnDropId(overId)) return statusFromColumnDropId(overId);
  return tasks.find((t) => t.id === overId)?.status ?? null;
}

function sortedColumn(tasks: Task[], status: TaskStatus, excludeId?: string): Task[] {
  return tasks
    .filter((t) => t.status === status && (!excludeId || t.id !== excludeId))
    .sort((a, b) => a.order - b.order);
}

function indexInColumn(col: Task[], targetId: string): number | null {
  const i = col.findIndex((t) => t.id === targetId);
  return i === -1 ? null : i;
}

function applyUpdatesToCache(cache: Task[], updates: ReorderTaskUpdate[]): Task[] {
  const updateById = new Map(updates.map((u) => [u.id, u]));
  return cache.map((t) => {
    const u = updateById.get(t.id);
    return u ? { ...t, status: u.status, order: u.order } : t;
  });
}

function isNoopAgainst(truth: Task[], updates: ReorderTaskUpdate[]): boolean {
  return updates.every((u) => {
    const t = truth.find((x) => x.id === u.id);
    return Boolean(t && t.status === u.status && t.order === u.order);
  });
}

function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) grouped[t.status].push(t);
  for (const status of COLUMN_ORDER) {
    grouped[status].sort((a, b) => a.order - b.order);
  }
  return grouped;
}
