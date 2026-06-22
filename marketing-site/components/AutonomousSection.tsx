import { LOOP_COMMAND } from "@/lib/site"
import { CopyableCommand } from "./CopyableCommand"
import { GitPullRequest, Repeat, Rocket, Users } from "lucide-react"

const STEPS = [
  { icon: Repeat, title: "Watch on a loop", body: "Every minute, the agent checks Focus Forge for new or open tasks." },
  { icon: Users, title: "Spawn a team", body: "It fans out a team of subagents — one per task — working in parallel." },
  { icon: GitPullRequest, title: "Ship through PRs", body: "Each task is completed and opened as a reviewable pull request." },
  { icon: Rocket, title: "Verify deploys", body: "It confirms the work reaches staging and production before moving on." },
]

export function AutonomousSection() {
  return (
    <section id="autonomous" className="border-y border-border bg-card/40 py-20">
      <div className="mx-auto max-w-4xl px-5 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Your backlog, run autonomously
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">
          Focus Forge is built to be driven by agents. Drop this one-liner into
          Claude Code and it will keep clearing your task list — opening PRs and
          verifying deployments — on its own.
        </p>

        <div className="mx-auto mt-8 max-w-3xl">
          <CopyableCommand command={LOOP_COMMAND} />
          <p className="mt-3 text-xs text-muted-foreground">
            Click anywhere on the command to copy. Runs as a recurring Claude Code loop.
          </p>
        </div>

        <div className="mt-12 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-background p-5">
              <s.icon className="h-5 w-5 text-[rgb(var(--theme-primary-rgb))]" />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
