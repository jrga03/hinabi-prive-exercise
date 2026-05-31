import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppHeader({ slot }: { slot?: ReactNode }) {
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="focus-visible:ring-ring/50 focus-visible:ring-offset-background -m-1 inline-flex items-center gap-2 rounded-md p-1 font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-offset-2 max-sm:min-h-11"
        >
          <span aria-hidden className="bg-primary inline-block size-6 rounded-md" />
          <span className="hidden text-sm sm:inline">The Intelligent Task Orchestrator</span>
        </Link>
        <div className="flex-1">{slot}</div>
        <ThemeToggle />
      </div>
    </header>
  );
}
