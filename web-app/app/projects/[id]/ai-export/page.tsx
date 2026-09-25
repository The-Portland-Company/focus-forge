import { notFound } from "next/navigation"
import { getViewer } from "@/lib/auth/tpc-session"
import { resolveLocalUser } from "@/lib/auth/local-identity"
import { getProjectAiExportForUser } from "@/lib/project-ai-export"
import { ProjectAiExportPage } from "@/components/project-ai-export-page"

export default async function ProjectAiExportRoutePage(
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params
  const viewer = await getViewer()
  const localUser = viewer ? await resolveLocalUser(viewer) : null

  if (!localUser) {
    notFound()
  }

  const payload = await getProjectAiExportForUser(params.id, localUser.id)

  if (!payload) {
    notFound()
  }

  return (
    <ProjectAiExportPage
      projectName={payload.project.name}
      exportJson={JSON.stringify(payload, null, 2)}
    />
  )
}
