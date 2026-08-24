import { Check, Minus, X } from "lucide-react"
import type { Cell, FeatureRow } from "@/lib/compare"

function CellMark({ cell, note }: { cell: Cell; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {cell === "yes" && (
        <Check className="h-5 w-5 text-emerald-500" aria-label="Yes" />
      )}
      {cell === "no" && (
        <X className="h-5 w-5 text-muted-foreground/50" aria-label="No" />
      )}
      {cell === "partial" && (
        <Minus className="h-5 w-5 text-amber-500" aria-label="Partial" />
      )}
      {note && (
        <span className="text-[11px] leading-tight text-muted-foreground">
          {note}
        </span>
      )}
    </div>
  )
}

/**
 * Comparison grid. When `only` is a competitor slug, renders a focused
 * Focus Forge vs. <competitor> two-column table; otherwise renders the full
 * matrix across every competitor.
 */
export function CompareTable({
  rows,
  competitors,
  only,
}: {
  rows: FeatureRow[]
  competitors: { slug: string; name: string }[]
  only?: string
}) {
  const cols = only
    ? competitors.filter((c) => c.slug === only)
    : competitors

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-4 pr-4 text-left font-medium text-muted-foreground">
              Capability
            </th>
            <th className="px-3 py-4 text-center font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded brand-gradient text-[10px] font-bold text-white">
                  FF
                </span>
                Focus Forge
              </span>
            </th>
            {cols.map((c) => (
              <th
                key={c.slug}
                className="px-3 py-4 text-center font-medium text-muted-foreground"
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-border/60 align-top"
            >
              <td className="py-4 pr-4">
                <div className="font-medium">{row.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {row.detail}
                </div>
              </td>
              <td className="px-3 py-4 text-center">
                <CellMark cell="yes" />
              </td>
              {cols.map((c) => {
                const v = row.values[c.slug]
                return (
                  <td key={c.slug} className="px-3 py-4 text-center">
                    <CellMark cell={v?.cell ?? "no"} note={v?.note} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-muted-foreground">
        Based on publicly available product information and subject to change.
        Focus Forge capabilities reflect the current product. Verify the latest
        details on each vendor&rsquo;s site.
      </p>
    </div>
  )
}
