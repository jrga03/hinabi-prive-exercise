"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    console.error("Root route error:", error);
  }, [error]);

  function handleRetry() {
    queryClient.invalidateQueries();
    unstable_retry();
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center px-4 py-20 sm:px-6 lg:px-8">
        <div className="bg-card ring-foreground/10 max-w-md space-y-4 rounded-xl p-8 text-center ring-1">
          <div className="bg-destructive/10 text-destructive mx-auto flex size-10 items-center justify-center rounded-full">
            <AlertCircle className="size-5" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-medium">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              {error.message || "An unexpected error interrupted this page."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" render={<Link href="/" />}>
              Back home
            </Button>
            <Button onClick={handleRetry}>Try again</Button>
          </div>
        </div>
      </main>
    </>
  );
}
