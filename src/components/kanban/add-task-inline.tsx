"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { useCreateTask } from "@/hooks/use-tasks";
import type { TaskStatus } from "@/lib/types";

interface AddTaskInlineProps {
  projectId: string;
  status: TaskStatus;
}

export function AddTaskInline({ projectId, status }: AddTaskInlineProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const createTask = useCreateTask();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function reset() {
    setTitle("");
    setEditing(false);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      reset();
      return;
    }
    createTask.mutate(
      {
        projectId,
        status,
        title: trimmed,
        parentTaskId: null,
        category: null,
        description: undefined,
      },
      {
        onError: (err) => toast.error("Couldn't add task", { description: err.message }),
      }
    );
    reset();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-2"
      >
        <Plus className="size-3.5" aria-hidden />
        Add task
      </button>
    );
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
            reset();
          }
        }}
        placeholder="Task title…"
        maxLength={200}
        aria-label="New task title"
      />
    </form>
  );
}
