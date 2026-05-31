"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Circle, CircleCheckBig, CornerUpLeft, Loader2, Plus, Trash2 } from "lucide-react";
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
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "@/hooks/use-tasks";
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
            allTasks={tasks.data ?? []}
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
  allTasks: Task[];
  projectId: string;
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
}

function TaskDetailBody({ task, allTasks, projectId, onClose, onSelectTask }: TaskDetailBodyProps) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const parentTask = useMemo(
    () => (task.parentTaskId ? allTasks.find((t) => t.id === task.parentTaskId) : undefined),
    [allTasks, task.parentTaskId]
  );
  const subtasks = useMemo(
    () => allTasks.filter((t) => t.parentTaskId === task.id).sort((a, b) => a.order - b.order),
    [allTasks, task.id]
  );
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

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {parentTask ? (
          <button
            type="button"
            onClick={() => onSelectTask(parentTask.id)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-xs transition-colors outline-none focus-visible:ring-2 max-sm:min-h-11 max-sm:py-2"
          >
            <CornerUpLeft className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium tracking-wide uppercase">Parent</span>
              <span className="text-foreground line-clamp-1">{parentTask.title}</span>
            </span>
          </button>
        ) : null}
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
        <SubtaskSection
          parentTask={task}
          subtasks={subtasks}
          projectId={projectId}
          onSelectTask={onSelectTask}
        />
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

interface SubtaskSectionProps {
  parentTask: Task;
  subtasks: Task[];
  projectId: string;
  onSelectTask: (taskId: string) => void;
}

function SubtaskSection({ parentTask, subtasks, projectId, onSelectTask }: SubtaskSectionProps) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label="Sub-tasks" className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-foreground text-xs font-semibold tracking-wide uppercase">Sub-tasks</h3>
        <span className="text-muted-foreground text-xs tabular-nums">{subtasks.length}</span>
      </header>
      {subtasks.length === 0 ? (
        <p className="text-muted-foreground/80 px-1 text-xs">No sub-tasks yet.</p>
      ) : (
        <ul className="space-y-1">
          {subtasks.map((sub) => (
            <SubtaskRow key={sub.id} task={sub} projectId={projectId} onOpen={onSelectTask} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddSubtaskInline
          parentTask={parentTask}
          projectId={projectId}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="border-border/70 text-muted-foreground/90 hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs font-medium transition-colors outline-none focus-visible:ring-2 max-sm:h-11"
        >
          <Plus className="size-3.5" aria-hidden />
          Add sub-task
        </button>
      )}
    </section>
  );
}

interface SubtaskRowProps {
  task: Task;
  projectId: string;
  onOpen: (taskId: string) => void;
}

function SubtaskRow({ task, projectId, onOpen }: SubtaskRowProps) {
  const updateTask = useUpdateTask();
  const done = task.status === "done";

  function toggleDone() {
    const nextStatus: TaskStatus = done ? "todo" : "done";
    updateTask.mutate(
      { id: task.id, projectId, patch: { status: nextStatus } },
      {
        onError: (err) => toast.error("Couldn't update sub-task", { description: err.message }),
      }
    );
  }

  return (
    <li className="hover:bg-muted/60 group/sub flex items-center gap-2 rounded-md px-1 py-1">
      <button
        type="button"
        onClick={toggleDone}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        aria-pressed={done}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 max-sm:size-11"
      >
        {done ? (
          <CircleCheckBig
            className="size-4 text-emerald-600 max-sm:size-5 dark:text-emerald-400"
            aria-hidden
          />
        ) : (
          <Circle className="size-4 max-sm:size-5" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={cn(
          "text-foreground focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-2 max-sm:min-h-11 max-sm:py-2",
          done && "text-muted-foreground line-through"
        )}
      >
        {task.title}
      </button>
    </li>
  );
}

interface AddSubtaskInlineProps {
  parentTask: Task;
  projectId: string;
  onDone: () => void;
}

function AddSubtaskInline({ parentTask, projectId, onDone }: AddSubtaskInlineProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      onDone();
      return;
    }
    createTask.mutate(
      {
        projectId,
        parentTaskId: parentTask.id,
        title: trimmed,
        status: "todo",
        category: null,
        description: undefined,
      },
      {
        onError: (err) => toast.error("Couldn't add sub-task", { description: err.message }),
      }
    );
    setTitle("");
    onDone();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => submit()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setTitle("");
            onDone();
          }
        }}
        placeholder="Sub-task title…"
        maxLength={200}
        aria-label="New sub-task title"
      />
    </form>
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
