"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

import { TooltipProvider } from "@/components/ui/tooltip";

const ReactQueryDevtools =
  process.env.NODE_ENV === "production"
    ? () => null
    : dynamic(() => import("@tanstack/react-query-devtools").then((m) => m.ReactQueryDevtools), {
        ssr: false,
      });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={200}>{children}</TooltipProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
