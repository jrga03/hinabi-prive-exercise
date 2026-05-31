import { AppHeader } from "@/components/layout/app-header";
import { BoardColumnsSkeleton, BoardHeaderSkeleton } from "@/components/kanban/board-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <AppHeader slot={<Skeleton className="ml-1 h-4 w-16" aria-hidden="true" />} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <BoardHeaderSkeleton />
          <BoardColumnsSkeleton />
        </div>
      </main>
    </>
  );
}
