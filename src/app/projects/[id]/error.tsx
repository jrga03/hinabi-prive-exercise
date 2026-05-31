"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";

export default function BoardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Project board route error:", error);
  }, [error]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="bg-card ring-foreground/10 max-w-md space-y-4 rounded-xl p-8 text-center ring-1">
          <div className="bg-destructive/10 text-destructive mx-auto flex size-10 items-center justify-center rounded-full">
            <AlertCircle className="size-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-medium">Couldn&apos;t load this project</h1>
            <p className="text-muted-foreground text-sm">
              {error.message || "Something went wrong while loading the board."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" render={<Link href="/" />}>
              Back to projects
            </Button>
            <Button onClick={unstable_retry}>Try again</Button>
          </div>
        </div>
      </main>
    </>
  );
}
