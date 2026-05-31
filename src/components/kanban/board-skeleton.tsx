import { Skeleton } from "@/components/ui/skeleton";
import { COLUMN_META, COLUMN_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BoardHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="size-9" />
      </div>
    </div>
  );
}

export function BoardColumnsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMN_ORDER.map((status) => (
        <section key={status} className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("inline-block size-2 rounded-full", COLUMN_META[status].accent)}
            />
            <h2 className="font-heading text-sm font-medium tracking-tight">
              {COLUMN_META[status].label}
            </h2>
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </section>
      ))}
    </div>
  );
}
