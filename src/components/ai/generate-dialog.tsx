"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useMagicGenerate } from "@/hooks/use-magic-generate";
import type { Project } from "@/lib/types";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export function GenerateDialog({ open, onOpenChange, project }: GenerateDialogProps) {
  const [context, setContext] = useState("");
  const magic = useMagicGenerate();

  function closeAndReset() {
    setContext("");
    onOpenChange(false);
  }

  async function handleGenerate() {
    try {
      const tasks = await magic.mutateAsync({
        projectId: project.id,
        projectTitle: project.title,
        projectDescription: project.description,
        context: context.trim() || undefined,
      });
      toast.success(`Added ${tasks.length} tasks`, { description: "Find them in To Do." });
      closeAndReset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Couldn't generate tasks", { description: message });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (magic.isPending && !next) return;
        if (!next) closeAndReset();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate tasks for &ldquo;{project.title}&rdquo;</DialogTitle>
          <DialogDescription>
            Gemini drafts 5 categorized starter tasks. Land them in To Do; refine from there.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="magic-context">Anything specific? (optional)</Label>
          <Textarea
            id="magic-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. B2B SaaS, GTM-heavy, 4-week runway"
            disabled={magic.isPending}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeAndReset}
            disabled={magic.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={magic.isPending}>
            <Sparkles />
            {magic.isPending ? "Generating…" : "Generate 5 tasks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
