"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteTask, useTasks, useUpdateTask } from "@/hooks/use-tasks";
import { CATEGORY_META, CATEGORY_OPTIONS } from "@/lib/categories";
import { COLUMN_META, COLUMN_ORDER } from "@/lib/constants";
import { TASK_CATEGORIES, TASK_STATUSES } from "@/lib/schemas";
import type { Task, TaskCategory, TaskStatus, UpdateTaskInput } from "@/lib/types";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "__none__" as const;
const CATEGORY_FORM_VALUES = [NO_CATEGORY, ...TASK_CATEGORIES] as const;

const FormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES),
  category: z.enum(CATEGORY_FORM_VALUES),
});

type FormValues = z.infer<typeof FormSchema>;

function toFormValues(task: Task): FormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    category: task.category ?? NO_CATEGORY,
  };
}

function buildPatch(values: FormValues, task: Task): UpdateTaskInput {
  const patch: UpdateTaskInput = {};
  const title = values.title.trim();
  if (title !== task.title) patch.title = title;
  const description = values.description?.trim() ?? "";
  const original = task.description ?? "";
  if (description !== original) patch.description = description || undefined;
  if (values.status !== task.status) patch.status = values.status;
  const category = values.category === NO_CATEGORY ? null : (values.category as TaskCategory);
  if (category !== task.category) patch.category = category;
  return patch;
}

interface TaskDetailPanelProps {
  taskId: string | null;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectTask: (taskId: string) => void;
}

export function TaskDetailPanel({
  taskId,
  projectId,
  onOpenChange,
  onSelectTask,
}: TaskDetailPanelProps) {
  const tasks = useTasks(projectId);
  const task = useMemo(
    () => (taskId ? tasks.data?.find((t) => t.id === taskId) : undefined),
    [tasks.data, taskId]
  );

  return (
    <Sheet
      open={Boolean(taskId)}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <SheetContent className="data-[side=right]:sm:max-w-[440px]">
        {task ? (
          <TaskDetailBody
            task={task}
            projectId={projectId}
            onClose={() => onOpenChange(false)}
            onSelectTask={onSelectTask}
          />
        ) : (
          <div className="text-muted-foreground p-6 text-sm">Task not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface TaskDetailBodyProps {
  task: Task;
  projectId: string;
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
}

function TaskDetailBody({ task, projectId, onClose }: TaskDetailBodyProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: toFormValues(task),
    mode: "onChange",
  });

  // Re-seed form when the selected task id changes — but NOT when the same
  // task's data updates from elsewhere (drag, cache invalidation). That would
  // stomp user edits mid-typing.
  useEffect(() => {
    form.reset(toFormValues(taskRef.current));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Acknowledge unused arg lint: form is stable per RHF docs.
  }, [task.id, form]);

  useEffect(() => {
    // form.watch as side-effect subscription is the RHF-recommended pattern.
    // The React Compiler warning ("returns functions which cannot be memoized")
    // is a false positive here: we never pass the watched value downstream.
    // eslint-disable-next-line react-hooks/incompatible-library
    const sub = form.watch((values, { type }) => {
      // form.reset emits type === undefined; only react to user changes.
      if (type !== "change") return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!form.formState.isValid) return;
        const safeValues = FormSchema.safeParse(values);
        if (!safeValues.success) return;
        const patch = buildPatch(safeValues.data, taskRef.current);
        if (Object.keys(patch).length === 0) return;
        updateTask.mutate(
          { id: taskRef.current.id, projectId, patch },
          {
            onSuccess: () => {
              setSavedAt(Date.now());
              if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
              savedTimerRef.current = setTimeout(() => setSavedAt(null), 1500);
            },
            onError: (err) => {
              toast.error("Couldn't save changes", { description: err.message });
            },
          }
        );
      }, 500);
    });
    return () => sub.unsubscribe();
  }, [form, projectId, updateTask]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  function handleDelete() {
    const title = task.title;
    deleteTask.mutate(
      { id: task.id, projectId },
      {
        onSuccess: () => {
          toast.success(`Deleted “${title}”`);
          onClose();
        },
        onError: (err) => {
          toast.error("Couldn't delete task", { description: err.message });
        },
      }
    );
  }

  const savedRecently = savedAt !== null;

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle>Task</SheetTitle>
          <SaveIndicator saving={updateTask.isPending} saved={savedRecently} />
        </div>
        <SheetDescription>Edits save automatically.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={(e) => e.preventDefault()}
            noValidate
            aria-label="Edit task"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="What needs doing?" maxLength={200} {...field} />
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
                      rows={4}
                      maxLength={2000}
                      placeholder="Notes, acceptance criteria, links…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(value) => field.onChange(value as TaskStatus)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {COLUMN_ORDER.map((status) => (
                              <SelectItem key={status} value={status}>
                                <span
                                  aria-hidden
                                  className={cn(
                                    "inline-block size-2 rounded-full",
                                    COLUMN_META[status].accent
                                  )}
                                />
                                <span>{COLUMN_META[status].label}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={NO_CATEGORY}>
                              <span
                                aria-hidden
                                className="bg-muted-foreground/40 inline-block size-2 rounded-full"
                              />
                              <span className="text-muted-foreground">No category</span>
                            </SelectItem>
                            {CATEGORY_OPTIONS.map(({ value, label }) => {
                              const meta = CATEGORY_META[value];
                              return (
                                <SelectItem key={value} value={value}>
                                  <span
                                    aria-hidden
                                    className={cn("inline-block size-2 rounded-full", meta.dot)}
                                  />
                                  <span>{label}</span>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>

      <div className="border-t p-4">
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive w-full"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteTask.isPending}
        >
          <Trash2 />
          Delete task
        </Button>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (deleteTask.isPending && !open) return;
          setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{task.title}” and any sub-tasks will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteTask.isPending}
            >
              {deleteTask.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="size-3" aria-hidden />
        Saved
      </span>
    );
  }
  return null;
}
