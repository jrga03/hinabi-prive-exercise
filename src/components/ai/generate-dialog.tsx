"use client";

import { useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
import { GenerateTasksError, useMagicGenerate } from "@/hooks/use-magic-generate";
import type { Project } from "@/lib/types";

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
  const showSkeleton = magic.isPending;
  const showForm = !showSkeleton && !showError;

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

        {showSkeleton ? (
          <div className="grid gap-3" aria-live="polite" aria-busy="true">
            <p className="text-muted-foreground text-sm">Generating 5 tasks…</p>
            <div className="grid gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
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
          ) : showSkeleton ? (
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
