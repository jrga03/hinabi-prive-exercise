"use client"

import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateProject, useUpdateProject } from "@/hooks/use-projects"
import { ProjectSchema } from "@/lib/schemas"
import type { Project } from "@/lib/types"

export const ProjectFormSchema = ProjectSchema.pick({
  title: true,
  description: true,
}).extend({
  title: z.string().min(1, "Title is required").max(120, "Title is too long"),
  description: z.string().max(500, "Description is too long").optional(),
})

export type ProjectFormValues = z.infer<typeof ProjectFormSchema>

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  initialData?: Project
}

const EMPTY_VALUES: ProjectFormValues = { title: "", description: "" }

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  initialData,
}: ProjectDialogProps) {
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(ProjectFormSchema),
    defaultValues: initialData
      ? { title: initialData.title, description: initialData.description ?? "" }
      : EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      initialData
        ? { title: initialData.title, description: initialData.description ?? "" }
        : EMPTY_VALUES,
    )
  }, [open, initialData, form])

  const isSubmitting = createProject.isPending || updateProject.isPending

  async function onSubmit(values: ProjectFormValues) {
    const payload = {
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
    }
    try {
      if (mode === "edit" && initialData) {
        await updateProject.mutateAsync({ id: initialData.id, patch: payload })
        toast.success("Project updated")
      } else {
        await createProject.mutateAsync(payload)
        toast.success("Project created")
      }
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      form.setError("root", { type: "server", message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit project" : "Create a new project"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Rename or rewrite the description. Tasks are unaffected."
              : "Give it a short, scannable title. You can refine the description anytime."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      placeholder="e.g. Q3 marketing launch"
                      maxLength={120}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      maxLength={500}
                      placeholder="Optional — what's this project for?"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Up to 500 characters.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
