import { NotebookPen } from "lucide-react"

export function DevNotes() {
  return (
    <section id="devnotes" className="py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-2 md:gap-16">
        <div>
          <NotebookPen className="h-7 w-7 text-[rgb(var(--theme-primary-rgb))]" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            DevNotes: structured metadata, hidden in plain sight
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Tasks can carry machine-readable metadata alongside their human
            description. DevNotes lets agents and tooling embed structured data —
            branch names, PR links, deploy status, estimates — that travels with the
            task but never clutters what you read.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Embedded inline, stripped cleanly from the visible description",
              "Stored separately in the database so it stays queryable",
              "Perfect for autonomous agents reporting progress back onto a task",
            ].map((li) => (
              <li key={li} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full brand-gradient" />
                <span className="text-muted-foreground">{li}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-[#0b0b12] p-5 font-mono text-sm leading-relaxed text-zinc-300 shadow-2xl">
          <div className="text-zinc-500"># What you see</div>
          <div className="mt-1">Ship marketing site to Cloudflare</div>
          <div className="mt-4 text-zinc-500"># What travels with it</div>
          <div className="mt-1 break-words text-zinc-400">
            <span className="text-[rgb(var(--theme-primary-rgb))]">[DEVNOTES_META:</span>
            {" {"}
            <br />
            &nbsp;&nbsp;"branch": "feat/marketing-site",
            <br />
            &nbsp;&nbsp;"pr": 142,
            <br />
            &nbsp;&nbsp;"deploy": "staging",
            <br />
            &nbsp;&nbsp;"estimate_h": 4
            <br />
            {"}"}
            <span className="text-[rgb(var(--theme-primary-rgb))]">]</span>
          </div>
        </div>
      </div>
    </section>
  )
}
