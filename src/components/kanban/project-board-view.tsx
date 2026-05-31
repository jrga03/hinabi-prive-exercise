"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, FileQuestion, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/layout/app-header";
import { MagicGenerateButton } from "@/components/ai/magic-generate-button";
import { Board, BoardColumnsSkeleton } from "@/components/kanban/board";
import { ProjectDialog } from "@/components/projects/project-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteProject, useProject } from "@/hooks/use-projects";

interface ProjectBoardViewProps {
  projectId: string;
}

export function ProjectBoardView({ projectId }: ProjectBoardViewProps) {
  const project = useProject(projectId);
  const deleteProject = useDeleteProject();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
            <Button render={<Link href="/" />}>
              <ChevronLeft />
              Back to projects
            </Button>
          }
        />
      </BoardShell>
    );
  }

  const current = project.data;

  function handleEditOpenChange(open: boolean) {
    setEditOpen(open);
  }

  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open);
  }

  function confirmDelete() {
    setDeleteOpen(false);
    const title = current.title;
    deleteProject.mutate(current.id, {
      onSuccess: () => {
        toast.success(`Deleted “${title}”`);
        router.push("/");
      },
      onError: (err) => {
        toast.error("Couldn't delete project", { description: err.message });
      },
    });
  }

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
        <div className="flex items-center gap-2">
          <MagicGenerateButton project={current} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={`Actions for ${current.title}`} />
              }
            >
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6}>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Board projectId={current.id} />

      <ProjectDialog
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        mode="edit"
        initialData={current}
      />

      <AlertDialog open={deleteOpen} onOpenChange={handleDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              “{current.title}” and all of its tasks will be permanently removed. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? "Deleting…" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BoardShell>
  );
}

function BackToProjects() {
  return (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-offset-background -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="size-9" />
        </div>
      </div>
      <BoardColumnsSkeleton />
    </BoardShell>
  );
}
