"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
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
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Card-first collision detection. closestCorners alone lets the column drop
  // zone win when the cursor is in the padding/gap between cards (the "drop
  // at position 2 lands at position 1" bug), and unfiltered card preference
  // pulls cross-column drops back into the source column. The order:
  //   1. Pointer over a card → that card.
  //   2. Pointer over a column → the closest card IN that column, else the
  //      column itself (empty-column case).
  //   3. Fall back to closestCorners (rare — mostly off-screen drags).
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const inside = pointerWithin(args);

    const insideCard = inside.filter((c) => !isColumnDropId(String(c.id)));
    if (insideCard.length > 0) return insideCard;

    const insideColumn = inside.find((c) => isColumnDropId(String(c.id)));
    if (insideColumn) {
      const targetColumnId = String(insideColumn.id);
      const corners = closestCorners(args);
      const sameColumnCards = corners.filter((c) => {
        if (isColumnDropId(String(c.id))) return false;
        const sortable = (
          c.data?.droppableContainer?.data?.current as
            | { sortable?: { containerId?: string } }
            | undefined
        )?.sortable;
        return sortable?.containerId === targetColumnId;
      });
      if (sameColumnCards.length > 0) return sameColumnCards;
      return [insideColumn];
    }

    const intersect = rectIntersection(args);
    if (intersect.length > 0) return intersect;
    return closestCorners(args);
  }, []);

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
    const sourceCol = sortedColumn(snapshot, sourceStatus, activeIdStr);
    const targetColWithoutActive =
      sourceStatus === targetStatus ? sourceCol : sortedColumn(snapshot, targetStatus, activeIdStr);

    // Resolve the insertion index in the column WITHOUT the active item. This
    // is more robust than arrayMove(oldIdx, overIdx), which silently produces
    // the wrong position when the user drops on the *lower* half of a card —
    // we'd insert above when they wanted below.
    let insertAt: number;
    if (isColumnDropId(overIdStr)) {
      // Empty column or gap below all cards. Use cursor Y vs column rect
      // center to differentiate "drop near top" from "drop near bottom".
      const overRect = over.rect;
      const activeRect = active.rect.current.translated;
      const activeCenterY = activeRect ? activeRect.top + activeRect.height / 2 : null;
      const overCenterY = overRect ? overRect.top + overRect.height / 2 : null;
      insertAt =
        activeCenterY != null && overCenterY != null && activeCenterY < overCenterY
          ? 0
          : targetColWithoutActive.length;
    } else {
      const overIdx = targetColWithoutActive.findIndex((t) => t.id === overIdStr);
      if (overIdx === -1) {
        queryClient.setQueryData(taskKeys.byProject(projectId), snapshot);
        return;
      }
      const overRect = over.rect;
      const activeRect = active.rect.current.translated;
      const isBelowOverItem =
        activeRect != null &&
        overRect != null &&
        activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
      insertAt = overIdx + (isBelowOverItem ? 1 : 0);
    }

    const newTargetCol = [...targetColWithoutActive];
    newTargetCol.splice(insertAt, 0, { ...dragged, status: targetStatus });

    const updates: ReorderTaskUpdate[] =
      sourceStatus === targetStatus
        ? newTargetCol.map((t, i) => ({ id: t.id, status: targetStatus, order: i }))
        : [
            ...newTargetCol.map((t, i) => ({ id: t.id, status: targetStatus, order: i })),
            ...sourceCol.map((t, i) => ({ id: t.id, status: sourceStatus, order: i })),
          ];

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
      collisionDetection={collisionDetection}
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
