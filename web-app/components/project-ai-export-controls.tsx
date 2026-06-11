"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, FileJson, Link2 } from "lucide-react"
import { Tooltip } from "@/components/tooltip"

interface ProjectAiExportControlsProps {
  projectId: string
}

const iconButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"

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
      <Tooltip
        content={copied ? "Copied!" : "Copy JSON link"}
        side="bottom"
        align="end"
        className="inline-flex"
      >
        <button
          type="button"
          onClick={() => void copyLink()}
          className={iconButtonClass}
          aria-label="Copy JSON link"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </button>
      </Tooltip>
      <Tooltip
        content="Open JSON page"
        side="bottom"
        align="end"
        className="inline-flex"
      >
        <Link
          href={exportPagePath}
          target="_blank"
          className={iconButtonClass}
          aria-label="Open JSON page"
        >
          <FileJson className="h-4 w-4" />
        </Link>
      </Tooltip>
    </div>
  )
}
