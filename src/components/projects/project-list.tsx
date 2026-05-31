"use client"

import { useMemo, useState } from "react"
import { LayoutDashboard, Plus } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectDialog } from "@/components/projects/project-dialog"
import { useAllTasks } from "@/hooks/use-all-tasks"
import { useDeleteProject, useProjects } from "@/hooks/use-projects"
import type { Project } from "@/lib/types"

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; project: Project }
  | { mode: "closed" }

export function ProjectList() {
  const projects = useProjects()
  const tasks = useAllTasks()
  const deleteProject = useDeleteProject()
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" })
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  const taskCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const task of tasks.data ?? []) {
      map.set(task.projectId, (map.get(task.projectId) ?? 0) + 1)
    }
    return map
  }, [tasks.data])

  function handleCreate() {
    setDialog({ mode: "create" })
  }

  function handleEdit(project: Project) {
    setDialog({ mode: "edit", project })
  }

  function handleDelete(project: Project) {
    setPendingDelete(project)
  }

  function handleDialogChange(open: boolean) {
    if (!open) setDialog({ mode: "closed" })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    deleteProject.mutate(target.id, {
      onSuccess: () => toast.success(`Deleted “${target.title}”`),
      onError: (err) =>
        toast.error("Couldn't delete project", { description: err.message }),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspace
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Projects
          </h1>
        </div>
        <Button onClick={handleCreate}>
          <Plus />
          New project
        </Button>
      </div>

      {projects.isPending ? (
        <ProjectGridSkeleton />
      ) : projects.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load projects</AlertTitle>
          <AlertDescription>
            {projects.error.message}
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => projects.refetch()}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No projects yet"
          description="Spin up your first project to start shaping work into a board."
          action={
            <Button onClick={handleCreate}>
              <Plus />
              Create your first project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              taskCount={taskCounts.get(project.id) ?? 0}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <ProjectDialog
        open={dialog.mode !== "closed"}
        onOpenChange={handleDialogChange}
        mode={dialog.mode === "edit" ? "edit" : "create"}
        initialData={dialog.mode === "edit" ? dialog.project : undefined}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.title}” and all of its tasks will be permanently removed. This can't be undone.`
                : null}
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
    </div>
  )
}

function ProjectGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
        >
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
