"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { GenerateDialog } from "@/components/ai/generate-dialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/types";

interface MagicGenerateButtonProps {
  project: Project;
}

export function MagicGenerateButton({ project }: MagicGenerateButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary">
        <Sparkles />
        Magic Generate
      </Button>
      <GenerateDialog open={open} onOpenChange={setOpen} project={project} />
    </>
  );
}
