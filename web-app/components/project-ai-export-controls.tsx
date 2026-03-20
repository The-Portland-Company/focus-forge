"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, Copy, ExternalLink, FileJson, Loader2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ProjectAiExportControlsProps {
  projectId: string
  projectName: string
}

export function ProjectAiExportControls({
  projectId,
  projectName,
}: ProjectAiExportControlsProps) {
  const [exportJson, setExportJson] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "json" | "link">("idle")
  const exportPagePath = `/projects/${projectId}/ai-export`

  const setCopied = (value: "json" | "link") => {
    setCopyState(value)
    window.setTimeout(() => {
      setCopyState((current) => (current === value ? "idle" : current))
    }, 2000)
  }

  const loadExport = async () => {
    if (exportJson) return exportJson

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/ai-export`, {
        credentials: "include",
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load AI export.")
      }
      const nextJson = JSON.stringify(payload, null, 2)
      setExportJson(nextJson)
      return nextJson
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load AI export."
      setError(message)
      throw loadError
    } finally {
      setLoading(false)
    }
  }

  const copyExport = async () => {
    const json = await loadExport()
    await navigator.clipboard.writeText(json)
    setCopied("json")
  }

  const openPreview = async () => {
    await loadExport()
    setShowPreview(true)
  }

  const copyLink = async () => {
    const exportPageUrl =
      typeof window === "undefined"
        ? exportPagePath
        : new URL(exportPagePath, window.location.origin).toString()
    await navigator.clipboard.writeText(exportPageUrl)
    setCopied("link")
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyExport()}
          disabled={loading}
          className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : copyState === "json" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          Copy for AI
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void openPreview()}
          disabled={loading}
          className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
        >
          <FileJson className="w-4 h-4" />
          View JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyLink()}
          className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
        >
          {copyState === "link" ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
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

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Project AI Export</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {projectName}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-200">
              <code>{exportJson}</code>
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
