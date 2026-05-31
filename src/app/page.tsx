import { AppHeader } from "@/components/layout/app-header"
import { ProjectList } from "@/components/projects/project-list"

export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <ProjectList />
      </main>
    </>
  )
}
