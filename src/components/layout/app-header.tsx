import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppHeader({ slot }: { slot?: ReactNode }) {
  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="bg-primary inline-block size-6 rounded-md" />
          <span className="text-sm">TIO</span>
        </Link>
        <div className="flex-1">{slot}</div>
        <ThemeToggle />
      </div>
    </header>
  );
}
