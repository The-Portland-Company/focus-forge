"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, ExternalLink, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProjectAiExportControlsProps {
  projectId: string
}

export function ProjectAiExportControls({
  projectId,
}: ProjectAiExportControlsProps) {
  const [copied, setCopied] = useState(false)
  const exportPagePath = `/projects/${projectId}/ai-export`

  const handleCopied = () => {
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  const copyLink = async () => {
    const exportPageUrl =
      typeof window === "undefined"
        ? exportPagePath
        : new URL(exportPagePath, window.location.origin).toString()
    await navigator.clipboard.writeText(exportPageUrl)
    handleCopied()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => void copyLink()}
        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
      >
        {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
        Copy JSON Link
      </Button>
      <Button
        type="button"
        variant="outline"
        asChild
        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
      >
        <Link href={exportPagePath} target="_blank">
          <ExternalLink className="w-4 h-4" />
          JSON Page
        </Link>
      </Button>
    </div>
  )
}
