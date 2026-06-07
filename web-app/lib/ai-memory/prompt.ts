import type { AIPlaybook, RetrievedAIMemory } from "./types"

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return "high"
  if (confidence >= 0.5) return "med"
  return "low"
}

function flattenOutcome(outcomeJson: Record<string, unknown>): string {
  const fieldMap: Record<string, string> = {
    organization: "Organization",
    organization_id: "Organization",
    project: "Project",
    project_id: "Project",
    category: "Category",
    priority: "Priority",
    estimate: "Estimate",
    estimate_minutes: "Estimate",
    due_date: "Due Date",
    status: "Status",
    classification: "Classification",
    rule: "Rule",
  }

  const parts: string[] = []
  const seen = new Set<string>()

  for (const [key, label] of Object.entries(fieldMap)) {
    if (key in outcomeJson && !seen.has(label)) {
      seen.add(label)
      parts.push(`${label}: ${outcomeJson[key]}`)
    }
  }

  // Include any remaining keys not in the map
  for (const [key, value] of Object.entries(outcomeJson)) {
    if (!(key in fieldMap)) {
      parts.push(`${key}: ${value}`)
    }
  }

  return parts.join("; ") || "(no outcome fields)"
}

export function buildAIMemoryPromptBlock(memories: RetrievedAIMemory[]): string {
  if (!memories || memories.length === 0) return ""

  const lines: string[] = [
    "## AI Memory Precedents",
    "",
  ]

  memories.forEach((m, i) => {
    lines.push(`${i + 1}. **Input**: ${m.normalized_summary}`)
    lines.push(`   **User outcome**: ${flattenOutcome(m.outcome_json)}`)
    lines.push(`   **Source**: ${m.source_type.replace(/_/g, " ")} (seen ${m.source_count}×)`)
    lines.push(`   **Confidence**: ${confidenceLabel(m.confidence)} | **Weight**: ${m.weight.toFixed(1)}`)
    lines.push("")
  })

  lines.push(
    "Use these as precedents for judgment. Do not treat them as hard rules. Hard deterministic rules, if any, will override your output after this call.",
  )

  return lines.join("\n")
}

export function buildPlaybookPromptBlock(playbook: AIPlaybook | null): string {
  if (!playbook) return ""

  return [
    `## Decision Playbook (${playbook.playbook_type.replace(/_/g, " ")}, v${playbook.version})`,
    "",
    playbook.content_markdown.trim(),
    "",
  ].join("\n")
}
