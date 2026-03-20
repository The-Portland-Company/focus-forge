"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

interface ProjectAiExportPageProps {
  projectName: string
  exportJson: string
}

export function ProjectAiExportPage({
  projectName,
  exportJson,
}: ProjectAiExportPageProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportJson)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
              Project AI Export
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{projectName}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCopy()}
            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copy JSON
          </Button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl">
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-zinc-200">
            <code>{exportJson}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}
