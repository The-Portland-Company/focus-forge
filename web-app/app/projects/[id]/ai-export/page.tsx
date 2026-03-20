import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProjectAiExportForUser } from "@/lib/project-ai-export"
import { ProjectAiExportPage } from "@/components/project-ai-export-page"

export default async function ProjectAiExportRoutePage(
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    notFound()
  }

  const payload = await getProjectAiExportForUser(params.id, session.user.id)

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
