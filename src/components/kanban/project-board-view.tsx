"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, FileQuestion } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { MagicGenerateButton } from "@/components/ai/magic-generate-button";
import { Board } from "@/components/kanban/board";
import { BoardColumnsSkeleton, BoardHeaderSkeleton } from "@/components/kanban/board-skeleton";
import { TaskDetailPanel } from "@/components/kanban/task-detail-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/hooks/use-projects";

interface ProjectBoardViewProps {
  projectId: string;
}

export function ProjectBoardView({ projectId }: ProjectBoardViewProps) {
  const project = useProject(projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (project.isPending) {
    return <BoardLoading />;
  }

  if (project.isError) {
    return (
      <BoardShell breadcrumb={<BackToProjects />}>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this project</AlertTitle>
          <AlertDescription>
            {project.error.message}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => project.refetch()}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </BoardShell>
    );
  }

  if (!project.data) {
    return (
      <BoardShell breadcrumb={<BackToProjects />}>
        <EmptyState
          icon={FileQuestion}
          title="Project not found"
          description="It may have been deleted, or the link is incorrect."
          action={
            <Button render={<Link href="/" />} nativeButton={false}>
              <ChevronLeft />
              Back to projects
            </Button>
          }
        />
      </BoardShell>
    );
  }

  const current = project.data;

  return (
    <BoardShell breadcrumb={<BackToProjects />}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Project
          </p>
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">
            {current.title}
          </h1>
          {current.description ? (
            <p className="text-muted-foreground max-w-2xl text-sm">{current.description}</p>
          ) : null}
        </div>
        <MagicGenerateButton project={current} />
      </div>

      <Board projectId={current.id} onSelectTask={(task) => setSelectedTaskId(task.id)} />

      <TaskDetailPanel
        taskId={selectedTaskId}
        projectId={current.id}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
        onSelectTask={(taskId) => setSelectedTaskId(taskId)}
      />
    </BoardShell>
  );
}

function BackToProjects() {
  return (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-offset-background -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 max-sm:min-h-11"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Projects
    </Link>
  );
}

function BoardShell({
  breadcrumb,
  children,
}: {
  breadcrumb: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader slot={breadcrumb} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-8">{children}</div>
      </main>
    </>
  );
}

function BoardLoading() {
  return (
    <BoardShell breadcrumb={<Skeleton className="ml-1 h-4 w-16" aria-hidden="true" />}>
      <BoardHeaderSkeleton />
      <BoardColumnsSkeleton />
    </BoardShell>
  );
}
