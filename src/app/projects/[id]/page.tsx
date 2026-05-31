import { ProjectBoardView } from "@/components/kanban/project-board-view";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectBoardView projectId={id} />;
}
