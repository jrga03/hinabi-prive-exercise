"use client";

import { useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  GenerateTasksError,
  useMagicGenerate,
  type PartialAITask,
} from "@/hooks/use-magic-generate";
import { CATEGORY_META } from "@/lib/categories";
import type { TaskCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

const PLACEHOLDER_COUNT = 5;

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

function friendlyMessage(error: unknown): string {
  if (error instanceof GenerateTasksError) {
    if (error.status === 429) return "Too many requests. Wait a moment.";
    if (error.status === 502) return "AI returned unexpected output.";
    if (error.status >= 500) return "Our AI hit a snag.";
    return error.message || "Something went wrong.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function isKnownCategory(value: unknown): value is Exclude<TaskCategory, null> {
  return typeof value === "string" && value in CATEGORY_META;
}

function StreamingTaskRow({ task }: { task: PartialAITask | undefined }) {
  const title = task?.title?.trim();
  const category = isKnownCategory(task?.category) ? CATEGORY_META[task.category] : null;
  const hasTitle = Boolean(title);

  return (
    <div
      className={cn(
        "ring-foreground/10 grid min-h-12 gap-2 rounded-md p-3 ring-1 transition-colors",
        hasTitle ? "bg-card" : "bg-muted/40"
      )}
    >
      {hasTitle ? (
        <p className="line-clamp-2 text-sm leading-snug font-medium">{title}</p>
      ) : (
        <Skeleton className="h-4 w-2/3" />
      )}
      {category ? (
        <Badge variant="outline" className={cn("w-fit border-transparent ring-1", category.badge)}>
          {category.label}
        </Badge>
      ) : hasTitle ? null : (
        <Skeleton className="h-4 w-16" />
      )}
    </div>
  );
}

export function GenerateDialog({ open, onOpenChange, project }: GenerateDialogProps) {
  const [context, setContext] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const magic = useMagicGenerate();

  function closeAndReset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setContext("");
    magic.reset();
    onOpenChange(false);
  }

  async function runGenerate() {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const tasks = await magic.mutateAsync({
        projectId: project.id,
        projectTitle: project.title,
        projectDescription: project.description,
        context: context.trim() || undefined,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      toast.success(`Added ${tasks.length} tasks`, { description: "Find them in To Do." });
      closeAndReset();
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || controller.signal.aborted) {
        magic.reset();
        return;
      }
      // Otherwise mutation.isError will drive the inline error UI.
    }
  }

  const showError = magic.isError && !magic.isPending;
  const showStreaming = magic.isPending;
  const showForm = !showStreaming && !showError;
  const streamedCount = magic.partialTasks.filter((t) => t?.title?.trim()).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else closeAndReset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate tasks for &ldquo;{project.title}&rdquo;</DialogTitle>
          <DialogDescription>
            Gemini drafts 5 categorized starter tasks. Land them in To Do; refine from there.
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="grid gap-2">
            <Label htmlFor="magic-context">Anything specific? (optional)</Label>
            <Textarea
              id="magic-context"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. B2B SaaS, GTM-heavy, 4-week runway"
            />
          </div>
        ) : null}

        {showStreaming ? (
          <div className="grid gap-3" aria-live="polite" aria-busy="true">
            <p className="text-muted-foreground text-sm">
              {streamedCount === 0
                ? "Generating 5 tasks…"
                : `Streaming ${streamedCount} of ${PLACEHOLDER_COUNT}…`}
            </p>
            <div className="grid gap-2">
              {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
                <StreamingTaskRow key={i} task={magic.partialTasks[i]} />
              ))}
            </div>
          </div>
        ) : null}

        {showError ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 grid gap-3 rounded-md border p-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
              <div className="grid gap-1">
                <p className="text-sm font-medium">{friendlyMessage(magic.error)}</p>
                <p className="text-muted-foreground text-xs">
                  Retry, or skip and add tasks yourself.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {showError ? (
            <>
              <Button type="button" variant="ghost" onClick={closeAndReset}>
                Skip and add manually
              </Button>
              <Button onClick={runGenerate}>
                <RefreshCw />
                Retry
              </Button>
            </>
          ) : showStreaming ? (
            <Button type="button" variant="outline" onClick={closeAndReset}>
              Cancel
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Cancel
              </Button>
              <Button onClick={runGenerate}>
                <Sparkles />
                Generate 5 tasks
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
