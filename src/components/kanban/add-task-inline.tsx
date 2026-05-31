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
  onDone: () => void;
}

export function AddTaskInline({ projectId, status, onDone }: AddTaskInlineProps) {
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
        placeholder="Task title…"
        maxLength={200}
        aria-label="New task title"
      />
    </form>
  );
}

export function AddTaskTrigger({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border/70 text-muted-foreground/90 hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs font-medium transition-colors outline-none focus-visible:ring-2 max-sm:h-11"
    >
      <Plus className="size-3.5" aria-hidden />
      {label ?? "Add task"}
    </button>
  );
}
