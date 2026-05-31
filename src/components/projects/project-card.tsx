"use client";

import Link from "next/link";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  taskCount: number;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

function stopMouse(event: React.MouseEvent | React.PointerEvent) {
  event.stopPropagation();
}

export function ProjectCard({ project, taskCount, onEdit, onDelete }: ProjectCardProps) {
  return (
    <article className="group/project bg-card text-card-foreground ring-foreground/10 hover:bg-muted/40 focus-within:ring-ring/50 relative isolate rounded-xl ring-1 transition-colors focus-within:ring-2">
      <Link
        href={`/projects/${project.id}`}
        className="block rounded-xl p-5 outline-none"
        aria-label={`Open ${project.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="font-heading truncate text-base leading-snug font-medium">
              {project.title}
            </h3>
            {project.description ? (
              <p className="text-muted-foreground line-clamp-2 text-sm">{project.description}</p>
            ) : (
              <p className="text-muted-foreground text-sm italic">No description</p>
            )}
          </div>
          {/* Spacer so the absolute-positioned menu doesn't overlap text */}
          <div className="size-7 shrink-0" aria-hidden />
        </div>
        <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="bg-primary inline-block size-1.5 rounded-full" />
            {taskCount} {taskCount === 1 ? "task" : "tasks"}
          </span>
          <span>{formatRelative(project.updatedAt)}</span>
        </div>
      </Link>
      <div className="absolute top-3 right-3" onClick={stopMouse}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${project.title}`}
                onPointerDown={stopMouse}
              />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onEdit(project);
              }}
            >
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(project);
              }}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
