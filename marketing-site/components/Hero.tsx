import { APP_URL } from "@/lib/site"
import { ArrowRight, Sparkles } from "lucide-react"
import { AppShot } from "./AppShot"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10%] -z-10 h-[480px] w-[820px] -translate-x-1/2 rounded-full opacity-30 blur-3xl brand-gradient"
      />
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center md:pt-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--theme-primary-rgb))]" />
          AI agent + autonomous loops, built in
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          The task manager your <span className="brand-text">AI agents</span> can actually run.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
          Focus Forge is a fast, dark-first task and project manager with a built-in
          AI agent. Plan your day, point an autonomous Claude Code loop at your tasks,
          and ship — on web, iOS, and macOS.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={APP_URL}
            className="inline-flex h-11 items-center gap-2 rounded-lg brand-gradient px-6 font-medium text-white transition-opacity hover:opacity-90 no-underline-link"
          >
            Get Focus Forge <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#autonomous"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-6 font-medium transition-colors hover:bg-accent no-underline-link"
          >
            See the autonomous loop
          </a>
        </div>

        <div className="mt-14">
          <AppShot
            dark="/media/screenshots/today-dark.png"
            alt="Focus Forge Today view showing tasks, due dates, and priorities"
            priority
            className="mx-auto max-w-5xl glow"
          />
        </div>
      </div>
    </section>
  )
}
