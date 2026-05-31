import { AppHeader } from "@/components/layout/app-header"

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Foundation in place. CRUD and the Kanban board land in Chunk C and D.
          </p>
        </div>
      </main>
    </>
  )
}
