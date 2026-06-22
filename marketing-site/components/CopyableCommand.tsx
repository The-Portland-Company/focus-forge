"use client"

import { useState } from "react"
import { Check, Copy, Terminal } from "lucide-react"

export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      // Fallback for older browsers / insecure contexts.
      const ta = document.createElement("textarea")
      ta.value = command
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative w-full overflow-hidden rounded-xl border border-border bg-[#0b0b12] text-left shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          <Terminal className="h-3.5 w-3.5" />
          Claude Code
        </div>
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-red-500/80" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-green-500/80" />
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command to clipboard"
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <code className="flex-1 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-zinc-200">
          <span className="select-none text-[rgb(var(--theme-primary-rgb))]">$ </span>
          {command}
        </code>
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10"
          aria-hidden
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </span>
      </button>
      <span
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute bottom-3 right-14 text-xs font-medium text-green-400 transition-opacity"
        style={{ opacity: copied ? 1 : 0 }}
      >
        Copied!
      </span>
    </div>
  )
}
