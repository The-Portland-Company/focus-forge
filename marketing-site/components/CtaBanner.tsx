import { APP_URL } from "@/lib/site"
import { ArrowRight } from "lucide-react"

export function CtaBanner() {
  return (
    <section className="px-5 py-20">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card px-6 py-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-20 blur-2xl brand-gradient"
        />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Put your backlog on autopilot
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Start organizing in minutes — then let your agents do the rest.
        </p>
        <a
          href={APP_URL}
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg brand-gradient px-6 font-medium text-white transition-opacity hover:opacity-90 no-underline-link"
        >
          Get Focus Forge <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  )
}
